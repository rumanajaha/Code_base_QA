"""CLI tool to inspect callers and callees of a function in Neo4j graph store.

Usage:
    python backend/scripts/graph_cli.py <repo_id> <qualified_name>

Example:
    python backend/scripts/graph_cli.py mini_shop shop.orders.create_order
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.indexing.graph_store import callees, callers, close_driver


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Query callees and callers of a function in the code graph."
    )
    parser.add_argument("repo_id", help="Repository identifier (e.g., mini_shop)")
    parser.add_argument(
        "qualified_name",
        help="Full dotted name of the target function/method (e.g., shop.orders.create_order)",
    )
    args = parser.parse_args()

    repo_id = args.repo_id
    qname = args.qualified_name

    try:
        callee_list = callees(repo_id, qname)
        caller_list = callers(repo_id, qname)

        print(f"\nFunction: {qname} (repo: {repo_id})\n")

        # 1. Print Callees (functions called by this function)
        print(f"Callees ({len(callee_list)}):")
        if not callee_list:
            print("  (none)")
        else:
            for item in callee_list:
                file_str = item.get("file_path") or "unknown"
                start = item.get("start_line")
                end = item.get("end_line")
                lines_str = f":{start}-{end}" if start and end else ""
                print(f"  -> {item['qualified_name']} ({file_str}{lines_str})")

        # 2. Print Callers (functions that call this function)
        print(f"\nCallers ({len(caller_list)}):")
        if not caller_list:
            print("  (none)")
        else:
            for item in caller_list:
                file_str = item.get("file_path") or "unknown"
                start = item.get("start_line")
                end = item.get("end_line")
                lines_str = f":{start}-{end}" if start and end else ""
                print(f"  <- {item['qualified_name']} ({file_str}{lines_str})")

        print()

    finally:
        close_driver()


if __name__ == "__main__":
    main()
