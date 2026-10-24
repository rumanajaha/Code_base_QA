"""Clone or use a local repository, chunk its Python files, and index them."""

import argparse
import sys
import time
from collections import Counter

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.indexing.graph_store import (
    clear_repo,
    ensure_schema,
    graph_counts,
    write_chunks,
    write_edges,
)
from app.indexing.vector_store import VectorStore
from app.ingestion.file_filter import list_source_files
from app.ingestion.github_client import clone_or_fetch, parse_repo_url
from app.parsing.ast_chunker import chunk_file
from app.parsing.dependency_extractor import extract_call_edges, extract_imports
from app.parsing.naive_chunker import chunk_file_naive


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

    # Clone/fetch a GitHub repo, or use the supplied local directory.
    if repository.startswith("https://github.com/"):
        owner, repo_name = parse_repo_url(repository)
        repo_id = f"{owner}__{repo_name}"
        repo_path = clone_or_fetch(repository)
    else:
        repo_path = Path(repository).resolve()
        if not repo_path.is_dir():
            parser.error(f"Local repository directory does not exist: {repo_path}")
        repo_id = repo_path.name

    source_files = list_source_files(repo_path)
    all_chunks = []
    files_dict: dict[str, str] = {}
    counts_by_type: Counter[str] = Counter()

    started = time.perf_counter()

    for relative_path in source_files:
        full_path = repo_path / relative_path

        # Replace undecodable bytes instead of aborting ingestion.
        source = full_path.read_text(encoding="utf-8", errors="replace")
        files_dict[str(relative_path)] = source

        if args.chunker == "ast":
            chunks = chunk_file(repo_id, str(relative_path), source)
        else:
            chunks = chunk_file_naive(repo_id, str(relative_path), source)

        all_chunks.extend(chunks)
        counts_by_type.update(chunk.node_type for chunk in chunks)

    # Vector store indexing (behaviour unchanged)
    store = VectorStore(repo_id)
    store.add_chunks(all_chunks)

    elapsed = time.perf_counter() - started

    print(f"Repository: {repo_id}")
    print(f"Chunker: {args.chunker}")
    print(f"Python files: {len(source_files)}")
    print(f"Chunks indexed: {len(all_chunks)}")
    for node_type, count in sorted(counts_by_type.items()):
        print(f"  {node_type}: {count}")
    print(f"Elapsed: {elapsed:.2f} seconds")

    # Graph indexing when --graph is passed
    if args.graph:
        print(f"\nBuilding dependency graph for '{repo_id}' in Neo4j...")
        import_res = extract_imports(repo_id, files_dict)
        call_edges, call_stats = extract_call_edges(
            repo_id, all_chunks, files_dict, import_res.symbol_table
        )
        all_edges = import_res.edges + call_edges

        clear_repo(repo_id)
        ensure_schema()
        write_chunks(repo_id, all_chunks)
        write_edges(repo_id, all_edges)

        counts = graph_counts(repo_id)
        print("\nGraph counts:")
        print(
            f"  Nodes: {counts['total_nodes']} "
            f"(File: {counts['File']}, Class: {counts['Class']}, Function: {counts['Function']})"
        )
        print(
            f"  Edges: {counts['total_edges']} "
            f"(CONTAINS: {counts['CONTAINS']}, IMPORTS: {counts['IMPORTS']}, CALLS: {counts['CALLS']})"
        )

        resolved = call_stats.get("resolved", len(call_edges))
        unresolved = call_stats.get("unresolved", 0)
        total_calls = resolved + unresolved
        rate = (resolved / total_calls * 100) if total_calls > 0 else 0.0
        print(f"Call resolution: {resolved} resolved, {unresolved} unresolved ({rate:.1f}% resolution rate)")


if __name__ == "__main__":
    main()