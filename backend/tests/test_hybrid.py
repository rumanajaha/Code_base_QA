"""Tests for hybrid retrieval strategy combining semantic search and graph expansion."""

import pytest

from app.models import Chunk, RetrievedItem
from app.retrieval import graph_expand, hybrid
from tests.test_graph_expand import FakeGraphStore, FakeVectorStore, make_chunk


def make_item(
    name: str,
    score: float,
    source: str = "semantic",
    via: str | None = None,
    code_length: int = 40,
) -> RetrievedItem:
    """Build a test retrieved item with a specified code length."""
    chunk = Chunk(
        id=name,
        repo_id="test_repo",
        file_path="shop/orders.py",
        start_line=1,
        end_line=5,
        node_type="function",
        name=name.rsplit(".", 1)[-1],
        qualified_name=name,
        code="x" * code_length,
    )
    return RetrievedItem(
        chunk=chunk,
        score=score,
        source=source,
        via=via,
        rank=1,
    )


def test_ordering_and_deduplication(monkeypatch):
    """Seeds appear first sorted by score, followed by neighbors; duplicates are removed."""
    seed_a = make_item("order.create", score=0.7)
    seed_b = make_item("order.submit", score=0.9)
    seed_dup = make_item("order.validate", score=0.5)

    neighbor_1 = make_item("order.subtotal", score=0.8, source="graph", via="order.create")
    neighbor_dup = make_item("order.validate", score=0.95, source="graph", via="order.submit")
    neighbor_2 = make_item("discount.apply", score=0.6, source="graph", via="order.create")

    monkeypatch.setattr(
        hybrid.VectorStore,
        "semantic_search",
        lambda self, q, k: [seed_a, seed_b, seed_dup],
    )
    monkeypatch.setattr(
        hybrid,
        "expand_neighbors",
        lambda repo_id, seeds, question, m, direction, include_imports: [
            neighbor_1,
            neighbor_dup,
            neighbor_2,
        ],
    )

    results = hybrid.retrieve_hybrid("test_repo", "order query", k=3, m=3, token_budget=5000)

    # 1. Deduplication: order.validate is only present once (as the seed)
    names = [item.chunk.qualified_name for item in results]
    assert names == [
        "order.submit",
        "order.create",
        "order.validate",
        "order.subtotal",
        "discount.apply",
    ]

    # 2. Ordering: seeds first sorted by score, then neighbors sorted by score
    assert [item.source for item in results] == [
        "semantic",
        "semantic",
        "semantic",
        "graph",
        "graph",
    ]
    assert [item.score for item in results] == [0.9, 0.7, 0.5, 0.8, 0.6]

    # 3. Via preservation and ranks renumbering
    assert results[0].via is None
    assert results[3].via == "order.create"
    assert results[4].via == "order.create"
    assert [item.rank for item in results] == [1, 2, 3, 4, 5]


def test_budget_trimming_drops_from_end(monkeypatch):
    """Items are dropped from the end when total tokens exceed budget."""
    # len // 4 tokens: 400 chars -> 100 tokens, 800 chars -> 200 tokens
    seed_1 = make_item("seed_1", score=0.9, code_length=400)      # 100 tokens
    seed_2 = make_item("seed_2", score=0.8, code_length=400)      # 100 tokens
    graph_1 = make_item("graph_1", score=0.7, source="graph", via="seed_1", code_length=800)  # 200 tokens
    graph_2 = make_item("graph_2", score=0.6, source="graph", via="seed_1", code_length=800)  # 200 tokens

    monkeypatch.setattr(
        hybrid.VectorStore,
        "semantic_search",
        lambda self, q, k: [seed_1, seed_2],
    )
    monkeypatch.setattr(
        hybrid,
        "expand_neighbors",
        lambda repo_id, seeds, question, m, direction, include_imports: [graph_1, graph_2],
    )

    # Total tokens = 100 + 100 + 200 + 200 = 600 tokens
    # Budget 450: graph_2 (200 tokens) must be dropped
    results = hybrid.retrieve_hybrid("test_repo", "q", k=2, m=2, token_budget=450)
    assert [item.chunk.qualified_name for item in results] == ["seed_1", "seed_2", "graph_1"]
    assert [item.rank for item in results] == [1, 2, 3]


def test_budget_trimming_never_drops_below_one_seed(monkeypatch):
    """Even if a single seed exceeds the token budget, it is not dropped."""
    # 2000 chars -> 500 tokens
    heavy_seed = make_item("heavy_seed", score=0.9, code_length=2000)

    monkeypatch.setattr(
        hybrid.VectorStore,
        "semantic_search",
        lambda self, q, k: [heavy_seed],
    )
    monkeypatch.setattr(
        hybrid,
        "expand_neighbors",
        lambda repo_id, seeds, question, m, direction, include_imports: [],
    )

    # Budget is only 50 tokens, but the single seed must remain
    results = hybrid.retrieve_hybrid("test_repo", "q", k=1, m=0, token_budget=50)
    assert len(results) == 1
    assert results[0].chunk.qualified_name == "heavy_seed"
    assert results[0].rank == 1


def test_mini_shop_integration(monkeypatch):
    """Integration test retrieving order creation and its graph callees in mini_shop."""
    seed_chunk = make_chunk("shop.orders.create_order")
    seed_item = RetrievedItem(
        chunk=seed_chunk,
        score=0.95,
        source="semantic",
        via=None,
        rank=1,
    )

    monkeypatch.setattr(
        hybrid.VectorStore,
        "semantic_search",
        lambda self, q, k: [seed_item],
    )
    monkeypatch.setattr(graph_expand, "GraphStore", FakeGraphStore)
    monkeypatch.setattr(graph_expand, "VectorStore", FakeVectorStore)
    monkeypatch.setattr(
        graph_expand.get_embedder(),
        "embed",
        lambda texts: [[1.0, 0.0] for _ in texts],
    )

    results = hybrid.retrieve_hybrid(
        repo_id="mini_shop",
        question="how does order creation work",
        k=1,
        m=2,
        direction="callees",
    )

    assert len(results) == 3
    # First is the seed
    assert results[0].chunk.qualified_name == "shop.orders.create_order"
    assert results[0].source == "semantic"
    assert results[0].rank == 1

    # Next are the graph callees discovered from create_order
    callee_names = {results[1].chunk.qualified_name, results[2].chunk.qualified_name}
    assert callee_names == {
        "shop.orders.calculate_order_subtotal",
        "shop.discounts.apply_order_discount",
    }
    assert all(item.source == "graph" for item in results[1:])
    assert all(item.via == "shop.orders.create_order" for item in results[1:])
    assert [item.rank for item in results] == [1, 2, 3]
