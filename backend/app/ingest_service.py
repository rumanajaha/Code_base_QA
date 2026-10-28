import hashlib
import json
import logging
from pathlib import Path
import re
import shutil
import threading
from typing import Callable

import chromadb

from app.config import settings
from app.indexing.graph_store import (
    clear_repo,
    ensure_schema,
    graph_counts,
    write_chunks,
    write_edges,
)
from app.indexing.vector_store import VectorStore, collection_name
from app.ingestion.file_filter import list_source_files
from app.ingestion.github_client import clone_or_fetch, parse_repo_url
from app.models import RepoStatus
from app.parsing.ast_chunker import chunk_file
from app.parsing.dependency_extractor import extract_call_edges, extract_imports
from app.parsing.naive_chunker import chunk_file_naive

logger = logging.getLogger(__name__)

REGISTRY_PATH = Path("data/repos.json")
_registry_lock = threading.Lock()


def make_repo_id(owner: str, repo: str, branch: str | None, default_branch: str) -> str:
    """Compute repository identifier considering owner, repo name, and branch.

    If branch is None or equals default_branch, returns f"{owner}__{repo}".
    Otherwise returns f"{owner}__{repo}__{slug}", where slug replaces characters
    outside [A-Za-z0-9._-] with '-', and appends a 6-hex sha1 hash if the slug differs
    from branch name to avoid collisions.
    """
    if branch is None or branch == default_branch:
        return f"{owner}__{repo}"

    slug = re.sub(r"[^A-Za-z0-9._-]", "-", branch)
    if slug != branch:
        h = hashlib.sha1(branch.encode("utf-8")).hexdigest()[:6]
        slug = f"{slug}-{h}"
    return f"{owner}__{repo}__{slug}"


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


def create_repo(url: str, branch: str | None = None, repo_id: str | None = None) -> RepoStatus:
    """Register a new repository in queued state."""
    if repo_id is None:
        if url.startswith("https://github.com/"):
            owner, name = parse_repo_url(url)
            repo_id = f"{owner}__{name}"
            root_path = str((Path(settings.REPOS_DIR) / repo_id).resolve())
        else:
            root_path = str(Path(url).resolve())
            repo_id = Path(url).stem
    else:
        root_path = str((Path(settings.REPOS_DIR) / repo_id).resolve())

    status = RepoStatus(
        repo_id=repo_id,
        repo_url=url,
        branch=branch,
        state="queued",
        stage=None,
        progress=0,
    )
    with _registry_lock:
        registry = _load_registry()
        record = status.model_dump()
        record["root_path"] = root_path
        registry[repo_id] = record
        _save_registry(registry)
    return status


def get_repo_root_path(repo_id: str) -> Path | None:
    """Return the absolute root path of a registered repository."""
    with _registry_lock:
        registry = _load_registry()
        record = registry.get(repo_id)
        if not record:
            return None
        root_str = record.get("root_path") or str(Path(settings.REPOS_DIR) / repo_id)
        path = Path(root_str).resolve()
        if path.exists():
            return path

        default_path = (Path(settings.REPOS_DIR) / repo_id).resolve()
        if default_path.exists():
            return default_path

        if "__" in repo_id:
            repo_name = repo_id.split("__", 1)[1]
            repos_dir = Path(settings.REPOS_DIR).resolve()
            if repos_dir.exists() and repos_dir.is_dir():
                for candidate in repos_dir.iterdir():
                    if candidate.is_dir() and (candidate.name == repo_name or candidate.name.endswith(f"__{repo_name}")):
                        return candidate

        return path


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
        if not registry:
            return []
        return [RepoStatus.model_validate(data) for data in registry.values()]


def delete_repo(repo_id: str) -> None:
    """Remove repository directory, Chroma collections, Neo4j graph, and registry entry."""
    # 1. Delete Chroma collections for repo_id and repo_id + "__naive"
    chroma_path = Path(settings.CHROMA_PATH)
    if not chroma_path.is_absolute():
        chroma_path = Path.cwd() / chroma_path
    try:
        chroma_client = chromadb.PersistentClient(path=str(chroma_path))
        target_collections = {
            repo_id,
            f"{repo_id}__naive",
            f"repo_{repo_id}",
            f"repo_{repo_id}__naive",
            collection_name(repo_id),
            collection_name(f"{repo_id}__naive"),
        }
        for name in target_collections:
            try:
                chroma_client.delete_collection(name)
            except Exception:
                pass
    except Exception as exc:
        logger.warning("Error deleting Chroma collections for '%s': %s", repo_id, exc)

    # 2. Clear Neo4j graph
    try:
        clear_repo(repo_id)
    except Exception as exc:
        logger.warning("Error clearing Neo4j graph for '%s': %s", repo_id, exc)

    # 3. Delete cloned directory (first verify the resolved path is inside REPOS_DIR)
    repos_dir = Path(settings.REPOS_DIR).resolve()
    root_path = get_repo_root_path(repo_id)
    if root_path is not None:
        resolved_root = root_path.resolve()
        if resolved_root.is_relative_to(repos_dir) and resolved_root != repos_dir:
            if resolved_root.exists() and resolved_root.is_dir():
                shutil.rmtree(resolved_root, ignore_errors=True)

    # 4. Remove from registry
    with _registry_lock:
        registry = _load_registry()
        if repo_id in registry:
            del registry[repo_id]
            _save_registry(registry)


def ingest_repository(
    source: str | Path,
    repo_id: str,
    branch: str | None = None,
    chunker: str = "ast",
    build_graph: bool = True,
    on_progress: Callable[..., None] | None = None,
) -> dict:
    """Chunk and index source files into vector and graph databases."""
    if on_progress:
        on_progress("ingesting", files=0, chunks=0)

    if str(source).startswith("https://github.com/"):
        if on_progress:
            on_progress("cloning", progress=15)
        repo_path = clone_or_fetch(str(source), branch=branch, repo_id=repo_id)
    else:
        repo_path = Path(source).resolve()
        if not repo_path.is_dir():
            raise FileNotFoundError(f"Directory not found: {repo_path}")

    source_files = list_source_files(repo_path)
    if on_progress:
        on_progress("chunking", progress=35, files=len(source_files))

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
        on_progress("indexing", progress=65, chunks=len(all_chunks))

    store = VectorStore(repo_id)
    store.add_chunks(all_chunks)

    graph_nodes = 0
    graph_edges = 0
    unresolved_calls = 0

    if build_graph:
        if on_progress:
            on_progress("graph", progress=85)
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
    branch: str | None = None,
    chunker: str = "ast",
    build_graph: bool = True,
) -> None:
    """Background task wrapper handling progress updates and failure states."""
    try:
        if str(source).startswith("https://github.com/"):
            root_path = str((Path(settings.REPOS_DIR) / repo_id).resolve())
        else:
            root_path = str(Path(source).resolve())
        update_status(
            repo_id,
            state="ingesting",
            stage="cloning",
            progress=5,
            error=None,
            root_path=root_path,
        )

        def progress_callback(stage: str, progress: int | None = None, **counts):
            valid_state = stage if stage in {"queued", "ingesting", "ready", "failed"} else "ingesting"
            stage_name = counts.pop("stage", stage if stage in {"cloning", "chunking", "indexing", "graph"} else None)
            if progress is None:
                default_progress = {"cloning": 15, "chunking": 35, "indexing": 65, "graph": 85}
                progress = default_progress.get(stage_name)
            update_status(repo_id, state=valid_state, stage=stage_name, progress=progress, **counts)

        summary = ingest_repository(
            source=source,
            repo_id=repo_id,
            branch=branch,
            chunker=chunker,
            build_graph=build_graph,
            on_progress=progress_callback,
        )

        update_status(
            repo_id,
            state="ready",
            stage=None,
            progress=100,
            files=summary["files"],
            chunks=summary["chunks"],
            graph_nodes=summary["graph_nodes"],
            graph_edges=summary["graph_edges"],
            unresolved_calls=summary["unresolved_calls"],
            error=None,
        )
    except Exception as exc:
        update_status(repo_id, state="failed", stage=None, error=str(exc))
