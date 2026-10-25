"""Ask a question about an indexed repository from the command line."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import QueryRequest
from app.pipeline import run_query


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ask a question about a repository."
    )
    parser.add_argument("repo_id", help="Repository ID used during ingestion")
    parser.add_argument("question", help="Question about the repository")
    parser.add_argument(
        "--mode",
        choices=["baseline", "semantic", "hybrid"],
        default="semantic",
        help="Answering mode (default: semantic)",
    )
    args = parser.parse_args()

    request = QueryRequest(
        repo_id=args.repo_id,
        question=args.question,
        mode=args.mode,
    )
    answer = run_query(request)

    print(f"\nMode: {answer.mode}")
    print("\nAnswer:")
    print(answer.text)

    print("\nCitations:")
    if answer.citations:
        for citation in answer.citations:
            mark = "✓" if citation.valid else "✗"
            print(
                f"  {mark} "
                f"{citation.file_path}:{citation.start_line}-{citation.end_line}"
            )
    else:
        print("  No citations.")

    print("\nRetrieved chunks:")
    if answer.retrieved:
        for item in answer.retrieved:
            chunk = item.chunk
            if item.source == "graph" and item.via:
                source_str = f"graph via {item.via}"
            else:
                score_str = f"{item.score:.2f}" if item.score is not None else "N/A"
                source_str = f"semantic {score_str}"
            print(
                f"  [{item.rank}] "
                f"{chunk.file_path}:{chunk.start_line}-{chunk.end_line} "
                f"({source_str})"
            )
            print(f"      {chunk.qualified_name}")
    else:
        print("  None.")

    print(f"\nLatency: {answer.latency_ms} ms")
    print(f"Tokens used: {answer.tokens_used}")


if __name__ == "__main__":
    main()