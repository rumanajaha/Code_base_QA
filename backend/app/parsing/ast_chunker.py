"""Tree-sitter AST-based Python code chunking.

Extracts semantic code chunks (module headers, classes, methods, and functions).
Falls back to naive sliding-window chunking if tree-sitter detects syntax errors.
"""
from __future__ import annotations

import ast
import inspect
from pathlib import Path
import sys
from typing import Literal

try:
    # pyrefly: ignore[missing-import]
    from tree_sitter import Language, Node, Parser
    # pyrefly: ignore[missing-import]
    import tree_sitter_python as tspython
except ImportError as err:
    print(
        f"Error importing tree-sitter dependencies: {err}\n"
        "Ensure 'tree-sitter' and 'tree-sitter-python' are installed in your environment:\n"
        "  pip install tree-sitter tree-sitter-python",
        file=sys.stderr,
    )
    sys.exit(1)

from app.models import Chunk
from app.parsing.naive_chunker import chunk_file_naive


_LANGUAGE = Language(tspython.language())


def _get_parser() -> Parser:
    """Initialize and return a fresh Tree-sitter Parser for Python."""
    try:
        return Parser(_LANGUAGE)
    except TypeError:
        parser = Parser()
        parser.language = _LANGUAGE
        return parser


def _path_to_dotted_module(path: str) -> str:
    """Convert a relative file path to a dotted module path string.

    Examples:
        "auth/service.py" -> "auth.service"
        "auth/__init__.py" -> "auth"
        "config.py" -> "config"
    """
    clean = path.replace("\\", "/").strip("./")
    if clean.endswith(".py"):
        clean = clean[:-3]
    parts = clean.split("/")
    if len(parts) > 1 and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def _extract_docstring(node: Node | None) -> str | None:
    """Extract clean docstring text from a module, class, or function body."""
    if not node:
        return None
    for child in node.named_children:
        if child.type == "expression_statement":
            if child.named_children and child.named_children[0].type == "string":
                raw = child.named_children[0].text.decode("utf-8", errors="replace")
                for quote in ('"""', "'''", '"', "'"):
                    if raw.startswith(quote) and raw.endswith(quote) and len(raw) >= 2 * len(quote):
                        raw = raw[len(quote) : -len(quote)]
                        break
                return inspect.cleandoc(raw)
        # The docstring must be the very first statement
        break
    return None


def _unwrap_decorated(node: Node) -> tuple[Node, Node]:
    """If node is decorated_definition, return (outer_node, inner_definition_node).

    Otherwise return (node, node).
    """
    if node.type == "decorated_definition":
        for child in node.children:
            if child.type in ("function_definition", "class_definition"):
                return node, child
    return node, node


def _get_safe_split_boundaries(
    source: str,
    lines: list[str],
    start_line: int,
    end_line: int,
) -> set[int]:
    """Find safe statement-end and blank-line split boundaries.

    To guarantee robust statement boundary detection on macOS ARM64 and avoid
    relying on deep native node iteration, we walk AST statement nodes using
    Python's standard `ast` module. Blank lines are also included as safe split points.
    """
    boundaries: set[int] = set()

    # 1. Statement ends identified by standard ast
    try:
        parsed = ast.parse(source)
        for node in ast.walk(parsed):
            if isinstance(node, ast.stmt) and hasattr(node, "end_lineno"):
                if node.end_lineno is not None and start_line <= node.end_lineno < end_line:
                    boundaries.add(node.end_lineno)
    except Exception:
        pass

    # 2. Blank lines between statements
    for line_idx in range(start_line - 1, min(end_line, len(lines))):
        if not lines[line_idx].strip():
            boundaries.add(line_idx + 1)

    return {b for b in boundaries if start_line <= b < end_line}


def _split_oversized_function(
    repo_id: str,
    path: str,
    outer: Node,
    inner: Node,
    node_type: Literal["function", "method"],
    name: str,
    qualified_name: str,
    parent_name: str | None,
    docstring: str | None,
    source: str,
    lines: list[str],
    source_bytes: bytes,
    max_chunk_lines: int,
) -> list[Chunk]:
    """Split an oversized function into consecutive block chunks.

    The first chunk contains the initial definition lines up to the first boundary.
    Subsequent chunks repeat the function signature line as the first line of code
    so that context is preserved during vector retrieval.
    """
    start_line = outer.start_point[0] + 1
    end_line = outer.end_point[0] + (1 if outer.end_point[1] > 0 else 0)
    end_line = max(start_line, min(end_line, len(lines)))

    # Extract signature line (e.g. 'def process(step: int) -> int:')
    body_node = inner.child_by_field_name("body")
    if body_node:
        sig_raw = source_bytes[inner.start_byte : body_node.start_byte].decode("utf-8", errors="replace").rstrip()
        sig_line = sig_raw.splitlines()[0] if sig_raw.splitlines() else lines[inner.start_point[0]].rstrip()
    else:
        sig_line = lines[inner.start_point[0]].rstrip()

    safe_boundaries = _get_safe_split_boundaries(source, lines, start_line, end_line)

    chunks: list[Chunk] = []
    current = start_line
    part = 0

    while current <= end_line:
        part += 1

        if part == 1:
            capacity = max_chunk_lines
            prefix = ""
        else:
            capacity = max(1, max_chunk_lines - 1)
            prefix = sig_line.strip() + "\n"

        target = min(end_line, current + capacity - 1)

        # Look for the best safe split boundary (prefer blank lines or statement ends)
        if target < end_line:
            candidates = [b for b in safe_boundaries if current <= b <= target]
            if candidates:
                blank_candidates = [b for b in candidates if not lines[b - 1].strip()]
                target = max(blank_candidates) if blank_candidates else max(candidates)

        if target < current:
            target = current

        slice_text = "".join(lines[current - 1 : target]).rstrip("\r\n")
        code_text = slice_text if part == 1 else prefix + slice_text

        chunks.append(
            Chunk(
                id=f"{repo_id}:{path}:{current}-{target}",
                repo_id=repo_id,
                file_path=path,
                start_line=current,
                end_line=target,
                node_type=node_type,
                name=name,
                qualified_name=qualified_name,
                parent_name=parent_name,
                docstring=docstring if part == 1 else None,
                code=code_text,
            )
        )
        current = target + 1

    return chunks


def _build_class_summary_code(
    outer: Node,
    inner: Node,
    body_node: Node | None,
    methods: list[tuple[Node, Node]],
    source_bytes: bytes,
) -> str:
    """Build a concise summary for an oversized class.

    Includes the class declaration line, the docstring (if any), and the signature
    of every method followed by ' ...'.
    """
    # 1. Class declaration line(s)
    class_sig = source_bytes[outer.start_byte : (body_node.start_byte if body_node else outer.end_byte)].decode("utf-8", errors="replace").rstrip()
    summary_parts = [class_sig]

    # 2. Docstring if present
    if body_node and body_node.named_children:
        first_child = body_node.named_children[0]
        if first_child.type == "expression_statement":
            doc_text = source_bytes[first_child.start_byte : first_child.end_byte].decode("utf-8", errors="replace")
            summary_parts.append(doc_text)

    # 3. Method signatures with ' ...'
    for m_outer, m_inner in methods:
        m_body = m_inner.child_by_field_name("body")
        m_sig = source_bytes[m_outer.start_byte : (m_body.start_byte if m_body else m_outer.end_byte)].decode("utf-8", errors="replace").rstrip()
        summary_parts.append(m_sig + " ...")

    return "\n".join(summary_parts)


def chunk_file(
    repo_id: str,
    path: str,
    source: str | bytes,
    max_chunk_lines: int = 150,
) -> list[Chunk]:
    """Parse Python source code using Tree-sitter and extract semantic code chunks.

    Features:
    1. Module header: Emits a 'module_header' chunk containing module docstring,
       imports, and top-level constants/assignments. Skipped if empty.
    2. Size limits: If a class exceeds max_chunk_lines, emits a class summary chunk
       plus individual method chunks. If a function exceeds max_chunk_lines, splits
       it into consecutive block chunks repeating the signature line.
    3. Error handling: If tree-sitter detects syntax errors (root.has_error), falls
       back to chunk_file_naive so no file is dropped. Never raises on bad input.

    Args:
        repo_id: Repository identifier.
        path: File path within the repository.
        source: Python source code as string or bytes.
        max_chunk_lines: Maximum number of lines permitted per chunk (default: 150).

    Returns:
        List of Chunk objects.
    """
    if max_chunk_lines <= 0:
        raise ValueError(f"max_chunk_lines must be greater than 0, got {max_chunk_lines}")

    # Handle bytes or decode errors gracefully
    if isinstance(source, bytes):
        source = source.decode("utf-8", errors="replace")

    if not source:
        return []

    norm_path = path.replace("\\", "/")
    file_name = Path(norm_path).name
    dotted_module = _path_to_dotted_module(norm_path)

    source_bytes = source.encode("utf-8", errors="replace")
    lines = source.splitlines(keepends=True)
    total_lines = len(lines)

    parser = _get_parser()
    tree = parser.parse(source_bytes)
    root = tree.root_node

    # Fallback to naive chunker if file has syntax errors
    if root.has_error:
        return chunk_file_naive(repo_id, norm_path, source)

    chunks: list[Chunk] = []

    # 1. Module header: all top-level statements outside functions and classes
    header_nodes: list[Node] = []
    for child in root.named_children:
        _, inner = _unwrap_decorated(child)
        if inner.type in ("function_definition", "class_definition"):
            continue
        header_nodes.append(child)

    if header_nodes:
        h_start = header_nodes[0].start_point[0] + 1
        h_end = header_nodes[-1].end_point[0] + (1 if header_nodes[-1].end_point[1] > 0 else 0)
        h_end = max(h_start, min(h_end, total_lines))
        h_code = "\n".join(
            source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")
            for node in header_nodes
        )
        chunks.append(
            Chunk(
                id=f"{repo_id}:{norm_path}:{h_start}-{h_end}",
                repo_id=repo_id,
                file_path=norm_path,
                start_line=h_start,
                end_line=h_end,
                node_type="module_header",
                name=file_name,
                qualified_name=dotted_module,
                parent_name=None,
                docstring=_extract_docstring(root),
                code=h_code,
            )
        )

    # 2. Functions and classes
    def emit_function_chunks(
        outer: Node,
        inner: Node,
        node_type: Literal["function", "method"],
        func_name: str,
        qualified_name: str,
        parent_name: str | None,
    ) -> None:
        start_line = outer.start_point[0] + 1
        end_line = outer.end_point[0] + (1 if outer.end_point[1] > 0 else 0)
        end_line = max(start_line, min(end_line, total_lines))
        body_node = inner.child_by_field_name("body")
        docstring = _extract_docstring(body_node)

        span = end_line - start_line + 1
        if span > max_chunk_lines:
            chunks.extend(
                _split_oversized_function(
                    repo_id=repo_id,
                    path=norm_path,
                    outer=outer,
                    inner=inner,
                    node_type=node_type,
                    name=func_name,
                    qualified_name=qualified_name,
                    parent_name=parent_name,
                    docstring=docstring,
                    source=source,
                    lines=lines,
                    source_bytes=source_bytes,
                    max_chunk_lines=max_chunk_lines,
                )
            )
        else:
            code_text = source_bytes[outer.start_byte : outer.end_byte].decode("utf-8", errors="replace")
            chunks.append(
                Chunk(
                    id=f"{repo_id}:{norm_path}:{start_line}-{end_line}",
                    repo_id=repo_id,
                    file_path=norm_path,
                    start_line=start_line,
                    end_line=end_line,
                    node_type=node_type,
                    name=func_name,
                    qualified_name=qualified_name,
                    parent_name=parent_name,
                    docstring=docstring,
                    code=code_text,
                )
            )

    for child in root.named_children:
        outer, inner = _unwrap_decorated(child)

        # Class definition
        if inner.type == "class_definition":
            name_node = inner.child_by_field_name("name")
            class_name = name_node.text.decode("utf-8", errors="replace") if name_node and name_node.text else "<anonymous>"
            qualified_name = f"{dotted_module}.{class_name}"
            start_line = outer.start_point[0] + 1
            end_line = outer.end_point[0] + (1 if outer.end_point[1] > 0 else 0)
            end_line = max(start_line, min(end_line, total_lines))
            body_node = inner.child_by_field_name("body")
            docstring = _extract_docstring(body_node)

            # Collect methods in class body
            methods: list[tuple[Node, Node]] = []
            if body_node:
                for body_child in body_node.named_children:
                    m_outer, m_inner = _unwrap_decorated(body_child)
                    if m_inner.type == "function_definition":
                        methods.append((m_outer, m_inner))

            span = end_line - start_line + 1
            if span > max_chunk_lines:
                class_code = _build_class_summary_code(outer, inner, body_node, methods, source_bytes)
            else:
                class_code = source_bytes[outer.start_byte : outer.end_byte].decode("utf-8", errors="replace")

            chunks.append(
                Chunk(
                    id=f"{repo_id}:{norm_path}:{start_line}-{end_line}",
                    repo_id=repo_id,
                    file_path=norm_path,
                    start_line=start_line,
                    end_line=end_line,
                    node_type="class",
                    name=class_name,
                    qualified_name=qualified_name,
                    parent_name=None,
                    docstring=docstring,
                    code=class_code,
                )
            )

            # Emit individual methods
            for m_outer, m_inner in methods:
                m_name_node = m_inner.child_by_field_name("name")
                m_name = m_name_node.text.decode("utf-8", errors="replace") if m_name_node and m_name_node.text else "<anonymous>"
                m_qualified = f"{qualified_name}.{m_name}"
                emit_function_chunks(m_outer, m_inner, "method", m_name, m_qualified, class_name)

        # Top-level function definition
        elif inner.type == "function_definition":
            name_node = inner.child_by_field_name("name")
            func_name = name_node.text.decode("utf-8", errors="replace") if name_node and name_node.text else "<anonymous>"
            qualified_name = f"{dotted_module}.{func_name}"
            emit_function_chunks(outer, inner, "function", func_name, qualified_name, None)

    return chunks
