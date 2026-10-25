"""Hybrid semantic and graph retrieval strategy."""

from app.indexing.vector_store import VectorStore
from app.models import RetrievedItem
from app.retrieval.graph_expand import expand_neighbors


def _estimate_tokens(item: RetrievedItem) -> int:
    return len(item.chunk.code) // 4


def retrieve_hybrid(
    repo_id: str,
    question: str,
    k: int = 5,
    m: int = 4,
    direction: str = "both",
    include_imports: bool = False,
    token_budget: int = 3000,
) -> list[RetrievedItem]:
    """Retrieve code chunks using semantic search and graph expansion."""
    store = VectorStore(repo_id)
    seeds = store.semantic_search(question, k=k) if k > 0 else []

    neighbors = (
        expand_neighbors(
            repo_id=repo_id,
            seeds=seeds,
            question=question,
            m=m,
            direction=direction,
            include_imports=include_imports,
        )
        if seeds and m > 0
        else []
    )

    sorted_seeds = sorted(
        seeds,
        key=lambda item: (item.score if item.score is not None else 0.0),
        reverse=True,
    )
    sorted_neighbors = sorted(
        neighbors,
        key=lambda item: (item.score if item.score is not None else 0.0),
        reverse=True,
    )

    merged: list[RetrievedItem] = []
    seen_ids: set[str] = set()
    for item in sorted_seeds + sorted_neighbors:
        if item.chunk.id not in seen_ids:
            seen_ids.add(item.chunk.id)
            merged.append(item)

    total_tokens = sum(_estimate_tokens(item) for item in merged)
    has_seed = any(item.source == "semantic" for item in merged)
    min_items = 1 if has_seed else 0

    while len(merged) > min_items and total_tokens > token_budget:
        dropped = merged.pop()
        total_tokens -= _estimate_tokens(dropped)

    return [
        RetrievedItem(
            chunk=item.chunk,
            score=item.score,
            source=item.source,
            via=item.via,
            rank=rank,
        )
        for rank, item in enumerate(merged, start=1)
    ]
