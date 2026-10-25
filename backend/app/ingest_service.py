"""Ingestion service and repository status registry."""

import json
from pathlib import Path
import threading
from typing import Callable

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
from app.models import RepoStatus
from app.parsing.ast_chunker import chunk_file
from app.parsing.dependency_extractor import extract_call_edges, extract_imports
from app.parsing.naive_chunker import chunk_file_naive

REGISTRY_PATH = Path("data/repos.json")
_registry_lock = threading.Lock()


def _load_registry() -> dict[str, dict]:
    if not REGISTRY_PATH.exists():
        return {}
    try:
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_registry(registry: dict[str, dict]) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")


def create_repo(url: str) -> RepoStatus:
    """Register a new repository in queued state."""
    if url.startswith("https://github.com/"):
        owner, name = parse_repo_url(url)
        repo_id = f"{owner}__{name}"
    else:
        repo_id = Path(url).stem

    status = RepoStatus(repo_id=repo_id, repo_url=url, state="queued")
    with _registry_lock:
        registry = _load_registry()
        registry[repo_id] = status.model_dump()
        _save_registry(registry)
    return status


def update_status(repo_id: str, **fields) -> RepoStatus | None:
    """Update fields on a repository status record."""
    with _registry_lock:
        registry = _load_registry()
        if repo_id not in registry:
            return None
        registry[repo_id].update(fields)
        _save_registry(registry)
        return RepoStatus.model_validate(registry[repo_id])


def get_status(repo_id: str) -> RepoStatus | None:
    """Fetch status for a specific repository."""
    with _registry_lock:
        registry = _load_registry()
        if repo_id not in registry:
            return None
        return RepoStatus.model_validate(registry[repo_id])


def list_repos() -> list[RepoStatus]:
    """List all registered repositories."""
    with _registry_lock:
        registry = _load_registry()
        return [RepoStatus.model_validate(data) for data in registry.values()]


def ingest_repository(
    source: str | Path,
    repo_id: str,
    chunker: str = "ast",
    build_graph: bool = True,
    on_progress: Callable[..., None] | None = None,
) -> dict:
    """Chunk and index source files into vector and graph databases."""
    if on_progress:
        on_progress("ingesting", files=0, chunks=0)

    if str(source).startswith("https://github.com/"):
        if on_progress:
            on_progress("cloning")
        repo_path = clone_or_fetch(str(source))
    else:
        repo_path = Path(source).resolve()
        if not repo_path.is_dir():
            raise FileNotFoundError(f"Directory not found: {repo_path}")

    source_files = list_source_files(repo_path)
    if on_progress:
        on_progress("chunking", files=len(source_files))

    all_chunks = []
    files_dict: dict[str, str] = {}
    for relative_path in source_files:
        full_path = repo_path / relative_path
        code = full_path.read_text(encoding="utf-8", errors="replace")
        files_dict[str(relative_path)] = code

        if chunker == "ast":
            chunks = chunk_file(repo_id, str(relative_path), code)
        else:
            chunks = chunk_file_naive(repo_id, str(relative_path), code)
        all_chunks.extend(chunks)

    if on_progress:
        on_progress("indexing", chunks=len(all_chunks))

    store = VectorStore(repo_id)
    store.add_chunks(all_chunks)

    graph_nodes = 0
    graph_edges = 0
    unresolved_calls = 0

    if build_graph:
        if on_progress:
            on_progress("graph")
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
        graph_nodes = counts.get("total_nodes", 0)
        graph_edges = counts.get("total_edges", 0)
        unresolved_calls = call_stats.get("unresolved", 0)

    return {
        "repo_id": repo_id,
        "files": len(source_files),
        "chunks": len(all_chunks),
        "graph_nodes": graph_nodes,
        "graph_edges": graph_edges,
        "unresolved_calls": unresolved_calls,
    }


def run_ingestion_task(
    source: str,
    repo_id: str,
    chunker: str = "ast",
    build_graph: bool = True,
) -> None:
    """Background task wrapper handling progress updates and failure states."""
    try:
        update_status(repo_id, state="ingesting", error=None)

        def progress_callback(state: str, **counts):
            valid_state = state if state in {"queued", "ingesting", "ready", "failed"} else "ingesting"
            update_status(repo_id, state=valid_state, **counts)

        summary = ingest_repository(
            source=source,
            repo_id=repo_id,
            chunker=chunker,
            build_graph=build_graph,
            on_progress=progress_callback,
        )

        update_status(
            repo_id,
            state="ready",
            files=summary["files"],
            chunks=summary["chunks"],
            graph_nodes=summary["graph_nodes"],
            graph_edges=summary["graph_edges"],
            unresolved_calls=summary["unresolved_calls"],
            error=None,
        )
    except Exception as exc:
        update_status(repo_id, state="failed", error=str(exc))
