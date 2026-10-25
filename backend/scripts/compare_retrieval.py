"""Compare semantic-only retrieval against hybrid retrieval."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.indexing.vector_store import VectorStore
from app.retrieval.hybrid import retrieve_hybrid


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare semantic and hybrid retrieval results."
    )
    parser.add_argument("repo_id", help="Repository ID")
    parser.add_argument("question", help="Search query or question")
    parser.add_argument("-k", type=int, default=5, help="Number of seeds (default: 5)")
    parser.add_argument("-m", type=int, default=4, help="Max graph neighbors (default: 4)")
    args = parser.parse_args()

    store = VectorStore(args.repo_id)
    semantic_results = store.semantic_search(args.question, k=args.k)

    try:
        hybrid_results = retrieve_hybrid(args.repo_id, args.question, k=args.k, m=args.m)
    except Exception as exc:
        if "Connection refused" in str(exc) or "ServiceUnavailable" in type(exc).__name__:
            print(
                "\n[Error] Could not connect to Neo4j. "
                "Please start Neo4j using 'docker compose up -d' to enable graph expansion."
            )
            sys.exit(1)
        raise

    print(f"\n--- Semantic-Only (top {len(semantic_results)}) ---")
    if not semantic_results:
        print("  (no results)")
    for item in semantic_results:
        chunk = item.chunk
        score_str = f"{item.score:.4f}" if item.score is not None else "N/A"
        print(f"  [{item.rank}] {chunk.file_path}:{chunk.start_line}-{chunk.end_line} (score={score_str})")
        print(f"      {chunk.qualified_name}")

    print(f"\n--- Hybrid Retrieval ({len(hybrid_results)}) ---")
    if not hybrid_results:
        print("  (no results)")
    for item in hybrid_results:
        chunk = item.chunk
        score_str = f"{item.score:.4f}" if item.score is not None else "N/A"
        if item.source == "graph" and item.via:
            tag = f"graph via {item.via}"
        else:
            tag = item.source

        print(f"  [{item.rank}] [{tag}] {chunk.file_path}:{chunk.start_line}-{chunk.end_line} (score={score_str})")
        print(f"      {chunk.qualified_name}")
    print()


if __name__ == "__main__":
    main()
