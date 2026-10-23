"""Search indexed repository chunks from the command line."""

import argparse

from app.indexing.vector_store import VectorStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Semantic search over indexed code.")
    parser.add_argument("repo_id", help="Repository ID used during ingestion")
    parser.add_argument("question", help="Natural-language search query")
    parser.add_argument("-k", type=int, default=5, help="Number of results (default: 5)")
    args = parser.parse_args()

    store = VectorStore(args.repo_id)
    results = store.semantic_search(args.question, k=args.k)

    if not results:
        print("No matching chunks found.")
        return

    for item in results:
        chunk = item.chunk
        print(
            f"[{item.rank}] score={item.score:.4f} "
            f"{chunk.file_path}:{chunk.start_line}-{chunk.end_line}"
        )
        print(f"    {chunk.qualified_name}")

        code_lines = chunk.code.splitlines()[:3]
        for line in code_lines:
            print(f"    {line}")
        print()


if __name__ == "__main__":
    main()