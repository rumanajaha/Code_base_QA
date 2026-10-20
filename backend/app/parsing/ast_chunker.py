"""Tree-sitter AST-based Python code chunking."""
import inspect
import sys
from pathlib import Path

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


def _get_parser() -> Parser:
    """Initialize and return a Tree-sitter Parser for Python."""
    python_language = Language(tspython.language())
    try:
        return Parser(python_language)
    except TypeError:
        parser = Parser()
        parser.language = python_language
        return parser


# Module-level reusable parser instance
_PARSER = _get_parser()


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


def _extract_docstring(body_node: Node | None) -> str | None:
    """Extract clean docstring text from a function or class body block if present."""
    if not body_node:
        return None
    for child in body_node.named_children:
        if child.type == "expression_statement":
            if child.named_children and child.named_children[0].type == "string":
                raw = child.named_children[0].text.decode("utf-8")
                for quote in ('"""', "'''", '"', "'"):
                    if raw.startswith(quote) and raw.endswith(quote) and len(raw) >= 2 * len(quote):
                        raw = raw[len(quote) : -len(quote)]
                        break
                return inspect.cleandoc(raw)
        # The docstring must be the very first statement in the body block
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


def chunk_file(repo_id: str, path: str, source: str) -> list[Chunk]:
    """Parse Python source code using Tree-sitter and extract semantic code chunks.

    Rules:
    - One chunk per top-level function (node_type="function"), per method inside a
      class ("method"), and per class ("class").
    - A class chunk contains the whole class including its methods.
    - Nested functions stay inside their parent chunk and are NOT emitted separately.
    - A decorated function or class chunk starts at its first decorator line.
    - qualified_name = dotted module path + optional class name + function/class name.
    - id = <repo_id>:<file_path>:<start_line>-<end_line>.
    - If the file has syntax errors, returns an empty list.

    Args:
        repo_id: Repository identifier.
        path: File path within the repository.
        source: Python source code as a string.

    Returns:
        List of Chunk objects extracted from the AST.
    """
    if not source:
        return []

    source_bytes = source.encode("utf-8")
    tree = _PARSER.parse(source_bytes)
    root = tree.root_node

    # If the file has syntax errors, return empty list
    if root.has_error:
        return []

    norm_path = path.replace("\\", "/")
    file_name = Path(norm_path).name
    dotted_module = _path_to_dotted_module(norm_path)

    chunks: list[Chunk] = []

    def process_node(node: Node) -> None:
        outer, inner = _unwrap_decorated(node)

        # Case 1: Class Definition
        if inner.type == "class_definition":
            name_node = inner.child_by_field_name("name")
            class_name = name_node.text.decode("utf-8") if name_node and name_node.text else "<anonymous>"
            qualified_name = f"{dotted_module}.{class_name}"
            start_line = outer.start_point.row + 1
            end_line = outer.end_point.row + 1
            code_text = source_bytes[outer.start_byte : outer.end_byte].decode("utf-8")
            body_node = inner.child_by_field_name("body")
            docstring = _extract_docstring(body_node)

            # Emit the class chunk (contains the whole class including its methods)
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
                    code=code_text,
                )
            )

            # Emit each method inside the class body
            if body_node:
                for child in body_node.named_children:
                    m_outer, m_inner = _unwrap_decorated(child)
                    if m_inner.type == "function_definition":
                        m_name_node = m_inner.child_by_field_name("name")
                        m_name = m_name_node.text.decode("utf-8") if m_name_node and m_name_node.text else "<anonymous>"
                        m_qualified_name = f"{dotted_module}.{class_name}.{m_name}"
                        m_start_line = m_outer.start_point.row + 1
                        m_end_line = m_outer.end_point.row + 1
                        m_code = source_bytes[m_outer.start_byte : m_outer.end_byte].decode("utf-8")
                        m_body = m_inner.child_by_field_name("body")
                        m_docstring = _extract_docstring(m_body)

                        chunks.append(
                            Chunk(
                                id=f"{repo_id}:{norm_path}:{m_start_line}-{m_end_line}",
                                repo_id=repo_id,
                                file_path=norm_path,
                                start_line=m_start_line,
                                end_line=m_end_line,
                                node_type="method",
                                name=m_name,
                                qualified_name=m_qualified_name,
                                parent_name=class_name,
                                docstring=m_docstring,
                                code=m_code,
                            )
                        )
            return

        # Case 2: Top-level Function Definition
        elif inner.type == "function_definition":
            name_node = inner.child_by_field_name("name")
            func_name = name_node.text.decode("utf-8") if name_node and name_node.text else "<anonymous>"
            qualified_name = f"{dotted_module}.{func_name}"
            start_line = outer.start_point.row + 1
            end_line = outer.end_point.row + 1
            code_text = source_bytes[outer.start_byte : outer.end_byte].decode("utf-8")
            body_node = inner.child_by_field_name("body")
            docstring = _extract_docstring(body_node)

            # Emit top-level function (nested functions remain inside code_text and are NOT emitted)
            chunks.append(
                Chunk(
                    id=f"{repo_id}:{norm_path}:{start_line}-{end_line}",
                    repo_id=repo_id,
                    file_path=norm_path,
                    start_line=start_line,
                    end_line=end_line,
                    node_type="function",
                    name=func_name,
                    qualified_name=qualified_name,
                    parent_name=None,
                    docstring=docstring,
                    code=code_text,
                )
            )
            return

        # Recurse for top-level compound statements (e.g. if __name__ == '__main__': blocks)
        for child in node.named_children:
            process_node(child)

    for child in root.named_children:
        process_node(child)

    return chunks
