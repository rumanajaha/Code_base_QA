
"""Graph-based expansion of semantically retrieved code chunks."""

from math import sqrt

from app.indexing.embedder import get_embedder
from app.indexing.graph_store import GraphStore
from app.indexing.vector_store import VectorStore
from app.models import Chunk, RetrievedItem


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    """Calculate cosine similarity between two embedding vectors."""
    if len(left) != len(right) or not left or not right:
        return 0.0

    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))

    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0

    return sum(a * b for a, b in zip(left, right)) / (
        left_norm * right_norm
    )


def _as_chunk(seed: Chunk | RetrievedItem) -> Chunk:
    """Return the underlying chunk from a seed."""
    return seed.chunk if isinstance(seed, RetrievedItem) else seed


def expand_neighbors(
    repo_id: str,
    seeds: list[Chunk] | list[RetrievedItem],
    question: str,
    m: int = 4,
    direction: str = "both",
    include_imports: bool = False,
) -> list[RetrievedItem]:
    """Expand seed chunks to graph neighbors and rank by question similarity."""
    if m <= 0 or not seeds:
        return []

    if direction not in {"callers", "callees", "both"}:
        raise ValueError("direction must be 'callers', 'callees', or 'both'")

    seed_chunks = [_as_chunk(seed) for seed in seeds]
    seed_names = {chunk.qualified_name for chunk in seed_chunks}

    graph = GraphStore(repo_id)
    vector_store = VectorStore(repo_id)

    # qualified name -> seed qualified name that discovered the candidate
    candidates: dict[str, str] = {}

    for seed in seed_chunks:
        seed_name = seed.qualified_name

        if direction in {"callers", "both"}:
            for neighbor in graph.callers(seed_name):
                name = neighbor.get("qualified_name")
                if name and name not in seed_names:
                    candidates.setdefault(name, seed_name)

        if direction in {"callees", "both"}:
            for neighbor in graph.callees(seed_name):
                name = neighbor.get("qualified_name")
                if name and name not in seed_names:
                    candidates.setdefault(name, seed_name)

    # Track which seed file imports each target file so provenance is correct.
    import_sources: dict[str, str] = {}

    if include_imports:
        seed_files = {chunk.file_path for chunk in seed_chunks}

        for seed in seed_chunks:
            for imported in graph.file_imports(seed.file_path):
                imported_path = imported.get("file_path")
                if imported_path and imported_path not in seed_files:
                    import_sources.setdefault(imported_path, seed.qualified_name)

    if not candidates and not import_sources:
        return []

    question_embedding = get_embedder().embed([question])[0]
    scored: dict[str, tuple[Chunk, float, str]] = {}

    if candidates:
        for chunk, embedding in vector_store.get_chunks_with_embeddings(
            list(candidates)
        ):
            name = chunk.qualified_name
            if name in seed_names or name not in candidates:
                continue

            scored[name] = (
                chunk,
                _cosine_similarity(question_embedding, embedding),
                candidates[name],
            )

    if import_sources:
        headers = vector_store.get_module_headers_for_files(
            list(import_sources)
        )

        for chunk, embedding in headers:
            name = chunk.qualified_name
            if name in seed_names or name in scored:
                continue

            seed_name = import_sources.get(chunk.file_path)
            if seed_name is None:
                continue

            scored[name] = (
                chunk,
                _cosine_similarity(question_embedding, embedding),
                seed_name,
            )

    ranked = sorted(
        scored.values(),
        key=lambda item: (-item[1], item[0].qualified_name),
    )[:m]

    return [
        RetrievedItem(
            chunk=chunk,
            score=score,
            source="graph",
            via=seed_name,
            rank=rank,
        )
        for rank, (chunk, score, seed_name) in enumerate(ranked, start=1)
    ]
