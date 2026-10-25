"""CLI script to ingest a repository using ingest_repository."""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ingest_service import ingest_repository
from app.ingestion.github_client import parse_repo_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest a repository into Chroma and Neo4j.")
    parser.add_argument("repository", help="GitHub HTTPS URL or local repository path")
    parser.add_argument(
        "--chunker",
        choices=["ast", "naive"],
        default="ast",
        help="Chunking strategy (default: ast)",
    )
    parser.add_argument(
        "--graph",
        action="store_true",
        help="Extract and index code dependency graph in Neo4j",
    )
    args = parser.parse_args()

    repository = args.repository
    if repository.startswith("https://github.com/"):
        owner, repo_name = parse_repo_url(repository)
        repo_id = f"{owner}__{repo_name}"
    else:
        repo_path = Path(repository).resolve()
        if not repo_path.is_dir():
            parser.error(f"Local repository directory does not exist: {repo_path}")
        repo_id = repo_path.name

    def on_progress(state: str, **counts):
        detail = " ".join(f"{k}={v}" for k, v in counts.items())
        print(f"[{state.upper()}] {detail}".strip())

    started = time.perf_counter()
    summary = ingest_repository(
        source=repository,
        repo_id=repo_id,
        chunker=args.chunker,
        build_graph=args.graph,
        on_progress=on_progress,
    )
    elapsed = time.perf_counter() - started

    print(f"\nRepository: {summary['repo_id']}")
    print(f"Files: {summary['files']}")
    print(f"Chunks: {summary['chunks']}")
    if args.graph:
        print(f"Graph nodes: {summary['graph_nodes']}")
        print(f"Graph edges: {summary['graph_edges']}")
        print(f"Unresolved calls: {summary['unresolved_calls']}")
    print(f"Elapsed: {elapsed:.2f} seconds")


if __name__ == "__main__":
    main()