"""Dependency relationship extractor for code graphs.

Parses Python files with Tree-sitter to discover import dependencies,
resolves internal repository module references to physical files,
and constructs a symbol table of local aliases for downstream call extraction.
"""
from __future__ import annotations

import builtins
from dataclasses import dataclass, field
import sys

try:
    from tree_sitter import Language, Node, Parser
    import tree_sitter_python as tspython
except ImportError as err:
    print(
        f"Error importing tree-sitter dependencies: {err}\n"
        "Ensure 'tree-sitter' and 'tree-sitter-python' are installed:\n"
        "  pip install tree-sitter tree-sitter-python",
        file=sys.stderr,
    )
    sys.exit(1)

from app.models import Chunk, Edge

_LANGUAGE = Language(tspython.language())


def _get_parser() -> Parser:
    """Initialize a Tree-sitter Parser for Python."""
    try:
        return Parser(_LANGUAGE)
    except TypeError:
        parser = Parser()
        parser.language = _LANGUAGE
        return parser


@dataclass
class ImportAnalysisResult:
    """Structured result of repository-wide import analysis."""

    edges: list[Edge] = field(default_factory=list)
    # Mapping of file_path -> {local_alias: resolved_target_qualified_name}
    symbol_table: dict[str, dict[str, str]] = field(default_factory=dict)
    external_imports_count: int = 0
    external_modules: list[str] = field(default_factory=list)


def _normalize_path(path: str) -> str:
    """Normalize file paths to forward slashes without leading dots or slashes."""
    return path.replace("\\", "/").lstrip("./")


def _find_file_for_module(module_name: str, file_set: set[str]) -> str | None:
    """Resolve a dotted module name to a physical file in the repository.

    Checks:
      1. module_name.py (e.g., 'shop.catalog' -> 'shop/catalog.py')
      2. module_name/__init__.py (e.g., 'shop' -> 'shop/__init__.py')
    """
    if not module_name:
        return None

    rel_path = module_name.replace(".", "/")

    # Check for direct Python module file
    file_candidate = f"{rel_path}.py"
    if file_candidate in file_set:
        return file_candidate

    # Check for package __init__.py file
    pkg_candidate = f"{rel_path}/__init__.py"
    if pkg_candidate in file_set:
        return pkg_candidate

    return None


def _resolve_relative_module(current_file: str, dots: int, suffix: str) -> str | None:
    """Resolve relative import dots and suffix into an absolute dotted module name.

    In Python:
      - 1 dot ('.'): relative to current file's package
      - 2 dots ('..'): relative to parent package
      - N dots: climb N - 1 packages up the directory hierarchy
    """
    pkg_parts = current_file.split("/")[:-1]

    if dots < 1:
        return suffix

    levels_up = dots - 1
    if levels_up > len(pkg_parts):
        # Cannot climb beyond repository root
        return None

    base_parts = pkg_parts[: len(pkg_parts) - levels_up] if levels_up > 0 else list(pkg_parts)
    if suffix:
        base_parts.extend(suffix.split("."))

    return ".".join(base_parts)


def _collect_import_nodes(root: Node) -> list[Node]:
    """Traverse AST and return all import_statement and import_from_statement nodes."""
    nodes: list[Node] = []
    stack = [root]
    while stack:
        curr = stack.pop()
        if curr.type in ("import_statement", "import_from_statement"):
            nodes.append(curr)
            continue
        stack.extend(reversed(curr.children))
    return nodes


def extract_imports(repo_id: str, files: dict[str, str]) -> ImportAnalysisResult:
    """Extract internal import edges, local symbol maps, and external import counts."""
    parser = _get_parser()

    # Map normalized path to original path for consistency
    normalized_files = {_normalize_path(p): src for p, src in files.items()}
    file_set = set(normalized_files.keys())

    edges_set: set[tuple[str, str]] = set()
    symbol_table: dict[str, dict[str, str]] = {}
    external_count = 0
    external_modules: list[str] = []

    for file_path, source_text in sorted(normalized_files.items()):
        symbols: dict[str, str] = {}
        symbol_table[file_path] = symbols

        tree = parser.parse(source_text.encode("utf-8", errors="replace"))
        import_nodes = _collect_import_nodes(tree.root_node)

        for stmt in import_nodes:
            # Case 1: Plain import statement: `import mod`, `import a, b as c`
            if stmt.type == "import_statement":
                for child in stmt.named_children:
                    if child.type == "dotted_name":
                        name = child.text.decode("utf-8")
                        target_file = _find_file_for_module(name, file_set)
                        if target_file:
                            if target_file != file_path:
                                edges_set.add((file_path, target_file))
                            symbols[name] = name
                        else:
                            external_count += 1
                            external_modules.append(name.split(".")[0])
                            symbols[name] = name

                    elif child.type == "aliased_import":
                        name_node = child.child_by_field_name("name")
                        alias_node = child.child_by_field_name("alias")
                        name = name_node.text.decode("utf-8") if name_node else ""
                        alias = alias_node.text.decode("utf-8") if alias_node else name

                        target_file = _find_file_for_module(name, file_set)
                        if target_file:
                            if target_file != file_path:
                                edges_set.add((file_path, target_file))
                            symbols[alias] = name
                        else:
                            external_count += 1
                            external_modules.append(name.split(".")[0])
                            symbols[alias] = name

            # Case 2: From-import statement: `from mod import item`, `from . import item`
            elif stmt.type == "import_from_statement":
                mod_node = stmt.child_by_field_name("module_name")
                from_mod = ""

                if mod_node:
                    if mod_node.type == "relative_import":
                        dots = 0
                        suffix = ""
                        for c in mod_node.children:
                            if c.type == "import_prefix":
                                dots += len(c.text)
                            elif c.type == "dotted_name":
                                suffix = c.text.decode("utf-8")
                        from_mod = _resolve_relative_module(file_path, dots, suffix) or ""
                    else:
                        from_mod = mod_node.text.decode("utf-8")

                # The remaining named children are the imported items
                imported_items = [c for c in stmt.named_children if c != mod_node]

                # Check if from_mod itself resolves to an internal repository file
                from_mod_file = _find_file_for_module(from_mod, file_set) if from_mod else None

                # If from_mod is external / standard library, count it once for the statement
                if not from_mod_file and from_mod:
                    external_count += 1
                    external_modules.append(from_mod.split(".")[0])

                for item in imported_items:
                    if item.type == "dotted_name":
                        item_name = item.text.decode("utf-8")
                        full_name = f"{from_mod}.{item_name}" if from_mod else item_name

                        # 1. Check if from_mod.item_name is a submodule file (e.g. from shop import catalog)
                        target_file = _find_file_for_module(full_name, file_set)
                        if target_file:
                            if target_file != file_path:
                                edges_set.add((file_path, target_file))
                            symbols[item_name] = full_name
                        elif from_mod_file:
                            # 2. Check if from_mod is a file (e.g. from shop.catalog import get_product)
                            if from_mod_file != file_path:
                                edges_set.add((file_path, from_mod_file))
                            symbols[item_name] = full_name
                        else:
                            # 3. External / stdlib import symbol
                            symbols[item_name] = full_name

                    elif item.type == "aliased_import":
                        name_node = item.child_by_field_name("name")
                        alias_node = item.child_by_field_name("alias")
                        item_name = name_node.text.decode("utf-8") if name_node else ""
                        alias = alias_node.text.decode("utf-8") if alias_node else item_name
                        full_name = f"{from_mod}.{item_name}" if from_mod else item_name

                        target_file = _find_file_for_module(full_name, file_set)
                        if target_file:
                            if target_file != file_path:
                                edges_set.add((file_path, target_file))
                            symbols[alias] = full_name
                        elif from_mod_file:
                            if from_mod_file != file_path:
                                edges_set.add((file_path, from_mod_file))
                            symbols[alias] = full_name
                        else:
                            symbols[alias] = full_name

                    elif item.type == "wildcard_import":
                        if from_mod_file:
                            if from_mod_file != file_path:
                                edges_set.add((file_path, from_mod_file))
                            symbols["*"] = f"{from_mod}.*"

    # Convert sorted unique edges to Edge model objects
    edges = [
        Edge(
            repo_id=repo_id,
            source_qualified_name=source,
            target_qualified_name=target,
            type="IMPORTS",
            resolved=True,
        )
        for source, target in sorted(edges_set)
    ]

    return ImportAnalysisResult(
        edges=edges,
        symbol_table=symbol_table,
        external_imports_count=external_count,
        external_modules=sorted(set(external_modules)),
    )


def extract_import_edges(repo_id: str, files: dict[str, str]) -> list[Edge]:
    """Parse files with Tree-sitter and return resolved internal IMPORTS edges."""
    return extract_imports(repo_id, files).edges


def count_external_imports(files: dict[str, str]) -> int:
    """Return the total count of external and standard-library imports across files."""
    return extract_imports("temp", files).external_imports_count


# Common built-in functions and standard container methods to exclude from unresolved calls
_BUILTIN_NAMES = set(dir(builtins))
_COMMON_BUILTIN_METHODS = {
    "append", "clear", "extend", "insert", "pop", "remove", "count", "index",
    "copy", "sort", "reverse", "get", "keys", "values", "items", "update",
    "split", "join", "strip", "lstrip", "rstrip", "lower", "upper",
    "startswith", "endswith", "replace", "encode", "decode", "read", "write", "close"
}


def extract_call_edges(
    repo_id: str,
    chunks: list[Chunk],
    files: dict[str, str],
    import_maps: dict[str, dict[str, str]],
) -> tuple[list[Edge], dict[str, Any]]:
    """Extract CALLS relationships between functions/methods inside a repository.

    Resolution order (stops at the first match):
      1. self.foo()  -> method named foo in the same enclosing class
      2. foo()       -> function in the same file with that name, or imported via import_map
      3. alias.foo() -> function foo in the module that alias refers to
      4. foo()       -> function with that exact unique name anywhere in the repo
                        (only if exactly one exists; no guessing on ambiguity)

    Returns:
      (edges, stats) where stats has {resolved, unresolved, ignored_dynamic, unresolved_examples}.
    """
    parser = _get_parser()
    func_chunks = [c for c in chunks if c.node_type in ("function", "method")]

    # Build fast lookup indexes
    funcs_by_file_and_name: dict[tuple[str, str], list[Chunk]] = {}
    funcs_by_name: dict[str, list[Chunk]] = {}
    methods_by_class: dict[tuple[str, str, str], Chunk] = {}
    chunks_by_qname = {c.qualified_name: c for c in func_chunks}

    for c in func_chunks:
        norm_file = _normalize_path(c.file_path)
        funcs_by_file_and_name.setdefault((norm_file, c.name), []).append(c)
        funcs_by_name.setdefault(c.name, []).append(c)
        if c.node_type == "method" and c.parent_name:
            methods_by_class[(norm_file, c.parent_name, c.name)] = c

    # Normalize import maps keys
    norm_import_maps = {_normalize_path(k): v for k, v in import_maps.items()}

    resolved_pairs: set[tuple[str, str]] = set()
    unresolved_examples: list[dict[str, Any]] = []
    ignored_dynamic_count = 0
    resolved_count = 0

    for caller in func_chunks:
        norm_file = _normalize_path(caller.file_path)
        file_map = norm_import_maps.get(norm_file, {})

        code_bytes = caller.code.encode("utf-8", errors="replace")
        tree = parser.parse(code_bytes)

        # Detect nested helper functions defined locally inside caller body
        local_funcs: dict[str, str] = {}
        for root_child in tree.root_node.named_children:
            if root_child.type in ("function_definition", "async_function_definition"):
                body = root_child.child_by_field_name("body")
                if body:
                    for b_child in body.named_children:
                        if b_child.type in ("function_definition", "async_function_definition"):
                            n_name_node = b_child.child_by_field_name("name")
                            if n_name_node:
                                n_name = n_name_node.text.decode("utf-8")
                                local_funcs[n_name] = f"{caller.qualified_name}.{n_name}"

        # Collect call nodes in caller, skipping any nested class bodies
        call_nodes: list[Node] = []
        stack = [tree.root_node]
        while stack:
            curr = stack.pop()
            if curr.type == "class_definition" and curr != tree.root_node:
                continue
            if curr.type == "call":
                call_nodes.append(curr)
            stack.extend(reversed(curr.children))

        for call_node in call_nodes:
            fn = call_node.child_by_field_name("function")
            if not fn:
                continue

            call_text = code_bytes[call_node.start_byte : call_node.end_byte].decode("utf-8")

            # ---------------------------------------------------------
            # Form A: Plain identifier call: foo(...)
            # ---------------------------------------------------------
            if fn.type == "identifier":
                foo = fn.text.decode("utf-8")

                # Skip built-in functions like len(), sum(), max()
                if foo in _BUILTIN_NAMES:
                    ignored_dynamic_count += 1
                    continue

                # 2a. Check nested helper function
                if foo in local_funcs:
                    resolved_pairs.add((caller.qualified_name, local_funcs[foo]))
                    resolved_count += 1
                    continue

                # 2b. Check function in the same file
                same_file_matches = funcs_by_file_and_name.get((norm_file, foo), [])
                if same_file_matches:
                    resolved_pairs.add((caller.qualified_name, same_file_matches[0].qualified_name))
                    resolved_count += 1
                    continue

                # 2c. Check name imported via import_map
                if foo in file_map:
                    target_qname = file_map[foo]
                    if target_qname in chunks_by_qname:
                        resolved_pairs.add((caller.qualified_name, target_qname))
                        resolved_count += 1
                        continue
                    else:
                        ignored_dynamic_count += 1
                        continue

                # 4. Check exact unique function name anywhere in repository
                candidates = funcs_by_name.get(foo, [])
                if len(candidates) == 1:
                    resolved_pairs.add((caller.qualified_name, candidates[0].qualified_name))
                    resolved_count += 1
                    continue
                else:
                    # Unresolved (0 candidates or >1 ambiguous candidates)
                    unresolved_examples.append(
                        {
                            "caller": caller.qualified_name,
                            "callee": foo,
                            "expression": call_text,
                            "reason": "ambiguous" if len(candidates) > 1 else "not_found",
                        }
                    )

            # ---------------------------------------------------------
            # Form B: Attribute call: self.foo(...) or alias.foo(...)
            # ---------------------------------------------------------
            elif fn.type == "attribute":
                obj = fn.child_by_field_name("object")
                attr = fn.child_by_field_name("attribute")
                if not obj or not attr:
                    ignored_dynamic_count += 1
                    continue

                foo = attr.text.decode("utf-8")

                # 1. self.foo() -> method named foo in the same class
                if obj.type == "identifier" and obj.text.decode("utf-8") == "self":
                    if caller.parent_name:
                        m = methods_by_class.get((norm_file, caller.parent_name, foo))
                        if m:
                            resolved_pairs.add((caller.qualified_name, m.qualified_name))
                            resolved_count += 1
                            continue

                    unresolved_examples.append(
                        {
                            "caller": caller.qualified_name,
                            "callee": f"self.{foo}",
                            "expression": call_text,
                            "reason": "method_not_found_in_class",
                        }
                    )
                    continue

                # 3. alias.foo() -> function in module that alias refers to
                obj_name = obj.text.decode("utf-8") if obj.type == "identifier" else ""
                if obj_name in file_map:
                    target_mod = file_map[obj_name]
                    target_qname = f"{target_mod}.{foo}"
                    if target_qname in chunks_by_qname:
                        resolved_pairs.add((caller.qualified_name, target_qname))
                        resolved_count += 1
                        continue
                    else:
                        ignored_dynamic_count += 1
                        continue

                # Method on class instance in same file or unique method in repo (e.g. cart.calculate_total)
                if foo not in _COMMON_BUILTIN_METHODS:
                    cand = funcs_by_name.get(foo, [])
                    if len(cand) == 1 and cand[0].node_type == "method":
                        resolved_pairs.add((caller.qualified_name, cand[0].qualified_name))
                        resolved_count += 1
                        continue

                # Anything else is arbitrary instance method (e.g. items.append) -> ignored dynamic
                ignored_dynamic_count += 1

            # ---------------------------------------------------------
            # Form C: Complex or dynamic expressions
            # ---------------------------------------------------------
            else:
                ignored_dynamic_count += 1

    edges = [
        Edge(
            repo_id=repo_id,
            source_qualified_name=source,
            target_qualified_name=target,
            type="CALLS",
            resolved=True,
        )
        for source, target in sorted(resolved_pairs)
    ]

    stats: dict[str, Any] = {
        "resolved": resolved_count,
        "unresolved": len(unresolved_examples),
        "ignored_dynamic": ignored_dynamic_count,
        "unresolved_examples": unresolved_examples,
    }

    return edges, stats

