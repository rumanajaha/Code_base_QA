"""Tree-sitter exploration script for parsing Python source code.

Usage:
    python backend/scripts/ts_playground.py <path-to-file> [--depth N]

This script demonstrates py-tree-sitter parsing with tree-sitter-python grammar:
1. Prints the AST tree as indented lines showing node type and 1-based line ranges up to a maximum depth.
2. Traverses the entire tree to summarize all function and class definitions with their names, line ranges, and parent node types.
"""
import argparse
import sys
from pathlib import Path

# Step 1: Import py-tree-sitter and tree-sitter-python bindings.
# In py-tree-sitter >= 0.22 (current 0.24+ / 0.26+), language grammars are loaded
# via Language(tspython.language()) and passed directly to Parser(language).
try:
    from tree_sitter import Language, Node, Parser
    import tree_sitter_python as tspython
except ImportError as err:
    print(
        f"Error importing tree-sitter dependencies: {err}\n"
        "Ensure 'tree-sitter' and 'tree-sitter-python' are installed in your environment:\n"
        "  pip install tree-sitter tree-sitter-python",
        file=sys.stderr,
    )
    sys.exit(1)


def init_parser() -> Parser:
    """Initialize and return a Tree-sitter Parser configured for Python.

    py-tree-sitter API note:
    In current py-tree-sitter versions (0.22+), Language wraps the C language pointer
    returned by tree_sitter_python.language(), and Parser accepts this Language object
    either in its constructor: Parser(python_language) or by assigning parser.language.
    """
    python_language = Language(tspython.language())
    try:
        # Standard in py-tree-sitter >= 0.22
        parser = Parser(python_language)
    except TypeError:
        # Fallback for older / alternative constructor signatures
        parser = Parser()
        parser.language = python_language
    return parser


def print_tree(node: Node, current_depth: int = 0, max_depth: int = 4) -> None:
    """Recursively print the syntax tree as indented lines for named nodes only.

    Args:
        node: The current AST node being visited.
        current_depth: The distance of the current node from the root (0 for root).
        max_depth: Maximum tree depth to print.
    """
    # Only display named nodes (ignores anonymous tokens such as colons, commas, operators)
    if not node.is_named:
        return

    # Tree-sitter points are 0-indexed (row 0 = line 1). Convert to 1-based line numbers.
    start_line = node.start_point.row + 1
    end_line = node.end_point.row + 1

    indent = "  " * current_depth
    print(f"{indent}{node.type} [{start_line}-{end_line}]")

    # Recurse into named children if within the max depth limit
    if current_depth < max_depth:
        for child in node.named_children:
            print_tree(child, current_depth=current_depth + 1, max_depth=max_depth)


def collect_definitions(node: Node, definitions: list[dict] | None = None) -> list[dict]:
    """Traverse the entire AST and collect all function and class definitions.

    Finds every 'function_definition' and 'class_definition' anywhere in the file,
    extracting its identifier name, 1-based start and end lines, and parent node type.

    Args:
        node: The root or current node being inspected.
        definitions: Accumulated list of definition info dictionaries.

    Returns:
        List of dictionaries with details for each definition found.
    """
    if definitions is None:
        definitions = []

    # Check if the node is a function or class definition
    if node.type in ("function_definition", "class_definition"):
        # Extract the definition name from the 'name' field
        name_node = node.child_by_field_name("name")
        name = name_node.text.decode("utf-8") if name_node and name_node.text else "<anonymous>"

        # Determine the parent node type (e.g. 'module', 'block', or 'decorated_definition')
        parent_type = node.parent.type if node.parent else "None"

        # Tree-sitter row indices are 0-based; convert to 1-based line numbers
        start_line = node.start_point.row + 1
        end_line = node.end_point.row + 1

        definitions.append({
            "type": node.type,
            "name": name,
            "start_line": start_line,
            "end_line": end_line,
            "parent_type": parent_type,
        })

    # Recurse into all children (both named and unnamed, to ensure complete coverage)
    for child in node.children:
        collect_definitions(child, definitions)

    return definitions


def main() -> None:
    """Parse CLI arguments, run tree-sitter parser, and print tree and definitions."""
    arg_parser = argparse.ArgumentParser(
        description="Parse a Python file using py-tree-sitter and display its AST and definition summary."
    )
    arg_parser.add_argument(
        "path",
        type=Path,
        help="Path to the Python source file to parse",
    )
    arg_parser.add_argument(
        "--depth",
        type=int,
        default=4,
        help="Maximum depth of the tree to display (default: 4)",
    )

    args = arg_parser.parse_args()

    # Step 2: Validate file existence and read contents as bytes
    if not args.path.is_file():
        print(f"Error: File not found: {args.path}", file=sys.stderr)
        sys.exit(1)

    try:
        source_code = args.path.read_bytes()
    except Exception as err:
        print(f"Error reading {args.path}: {err}", file=sys.stderr)
        sys.exit(1)

    # Step 3: Initialize tree-sitter parser and parse the source code
    parser = init_parser()
    tree = parser.parse(source_code)
    root_node = tree.root_node

    # Step 4: Print the AST tree as indented lines up to --depth (named nodes only)
    print(f"=== Tree: {args.path} (max depth: {args.depth}) ===")
    print_tree(root_node, current_depth=0, max_depth=args.depth)
    print()

    # Step 5: Collect and display a summary of every function and class definition
    print("=== Definitions Summary ===")
    definitions = collect_definitions(root_node)

    if not definitions:
        print("No function_definition or class_definition nodes found.")
    else:
        for item in definitions:
            print(
                f"- {item['type']}: {item['name']} "
                f"[{item['start_line']}-{item['end_line']}], "
                f"parent: {item['parent_type']}"
            )


if __name__ == "__main__":
    main()
