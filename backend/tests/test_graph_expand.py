
"""Tests for graph-based neighbor expansion."""

import pytest

from app.models import Chunk
from app.retrieval import graph_expand

REPO_ID = "mini_shop"


def make_chunk(
    name: str,
    file_path: str = "shop/orders.py",
    node_type: str = "function",
) -> Chunk:
    """Build a small test chunk."""
    return Chunk(
        id=name,
        repo_id=REPO_ID,
        file_path=file_path,
        start_line=1,
        end_line=5,
        node_type=node_type,
        name=name.rsplit(".", 1)[-1],
        qualified_name=name,
        code=f"def {name.rsplit('.', 1)[-1]}(): pass",
    )


class FakeGraphStore:
    """In-memory graph based on expected mini_shop relationships."""

    callers_map = {
        "shop.orders.validate_order_id": [
            "shop.orders.get_order_status",
            "shop.orders.submit_order_async",
            "shop.discounts.apply_order_discount",
        ],
        "shop.orders.calculate_order_subtotal": [
            "shop.orders.create_order",
        ],
        "shop.discounts.apply_order_discount": [
            "shop.orders.create_order",
        ],
    }

    callees_map = {
        "shop.orders.create_order": [
            "shop.orders.calculate_order_subtotal",
            "shop.discounts.apply_order_discount",
        ],
        "shop.orders.get_order_status": [
            "shop.orders.validate_order_id",
        ],
    }

    imports_map = {
        "shop/orders.py": [
            {
                "qualified_name": "shop.catalog",
                "file_path": "shop/catalog.py",
            },
            {
                "qualified_name": "shop.discounts",
                "file_path": "shop/discounts.py",
            },
        ],
    }

    def __init__(self, repo_id: str):
        self.repo_id = repo_id

    def callers(self, qualified_name: str):
        return [
            {"qualified_name": name}
            for name in self.callers_map.get(qualified_name, [])
        ]

    def callees(self, qualified_name: str):
        return [
            {"qualified_name": name}
            for name in self.callees_map.get(qualified_name, [])
        ]

    def file_imports(self, file_path: str):
        return self.imports_map.get(file_path, [])


class FakeVectorStore:
    """In-memory chunks and embeddings for deterministic ranking."""

    chunks = {
        "shop.orders.create_order": make_chunk(
            "shop.orders.create_order"
        ),
        "shop.orders.calculate_order_subtotal": make_chunk(
            "shop.orders.calculate_order_subtotal"
        ),
        "shop.discounts.apply_order_discount": make_chunk(
            "shop.discounts.apply_order_discount",
            "shop/discounts.py",
        ),
        "shop.orders.get_order_status": make_chunk(
            "shop.orders.get_order_status"
        ),
        "shop.orders.submit_order_async": make_chunk(
            "shop.orders.submit_order_async"
        ),
        "shop.orders.validate_order_id": make_chunk(
            "shop.orders.validate_order_id"
        ),
    }

    embeddings = {
        "shop.orders.create_order": [1.0, 0.0],
        "shop.orders.calculate_order_subtotal": [0.8, 0.2],
        "shop.discounts.apply_order_discount": [0.0, 1.0],
        "shop.orders.get_order_status": [0.6, 0.4],
        "shop.orders.submit_order_async": [0.4, 0.6],
        "shop.orders.validate_order_id": [0.7, 0.3],
    }

    headers = [
        (
            make_chunk(
                "shop.catalog",
                "shop/catalog.py",
                "module_header",
            ),
            [0.9, 0.1],
        ),
        (
            make_chunk(
                "shop.discounts",
                "shop/discounts.py",
                "module_header",
            ),
            [0.1, 0.9],
        ),
    ]

    def __init__(self, repo_id: str):
        self.repo_id = repo_id

    def get_chunks_with_embeddings(self, qualified_names: list[str]):
        return [
            (self.chunks[name], self.embeddings[name])
            for name in qualified_names
            if name in self.chunks
        ]

    def get_module_headers_for_files(self, file_paths: list[str]):
        return [
            (chunk, embedding)
            for chunk, embedding in self.headers
            if chunk.file_path in file_paths
        ]


@pytest.fixture(autouse=True)
def patch_stores(monkeypatch):
    monkeypatch.setattr(graph_expand, "GraphStore", FakeGraphStore)
    monkeypatch.setattr(graph_expand, "VectorStore", FakeVectorStore)
    monkeypatch.setattr(
        graph_expand.get_embedder(),
        "embed",
        lambda texts: [[1.0, 0.0] for _ in texts],
    )


def test_callees_returns_direct_callees():
    seed = make_chunk("shop.orders.create_order")

    results = graph_expand.expand_neighbors(
        REPO_ID, [seed], "create an order", direction="callees"
    )

    names = {item.chunk.qualified_name for item in results}
    assert names == {
        "shop.orders.calculate_order_subtotal",
        "shop.discounts.apply_order_discount",
    }


def test_callers_returns_direct_callers():
    seed = make_chunk("shop.orders.validate_order_id")

    results = graph_expand.expand_neighbors(
        REPO_ID, [seed], "validate order", direction="callers"
    )

    names = {item.chunk.qualified_name for item in results}
    assert names == {
        "shop.orders.get_order_status",
        "shop.orders.submit_order_async",
        "shop.discounts.apply_order_discount",
    }


def test_both_directions_deduplicate_candidates():
    seed = make_chunk("shop.orders.get_order_status")

    results = graph_expand.expand_neighbors(
        REPO_ID, [seed], "order status", direction="both"
    )

    names = [item.chunk.qualified_name for item in results]
    assert names.count("shop.orders.validate_order_id") == 1


def test_seed_is_excluded_from_results():
    seed = make_chunk("shop.orders.create_order")

    results = graph_expand.expand_neighbors(
        REPO_ID,
        [seed],
        "create order",
        direction="both",
    )

    assert all(
        item.chunk.qualified_name != seed.qualified_name
        for item in results
    )


def test_results_are_similarity_ranked_and_limited():
    seed = make_chunk("shop.orders.create_order")

    results = graph_expand.expand_neighbors(
        REPO_ID,
        [seed],
        "create order",
        direction="callees",
        m=1,
    )

    assert len(results) == 1
    assert results[0].chunk.qualified_name == (
        "shop.orders.calculate_order_subtotal"
    )
    assert results[0].rank == 1
    assert results[0].source == "graph"
    assert results[0].via == seed.qualified_name


def test_imports_add_module_headers_only():
    seed = make_chunk("shop.orders.create_order")

    results = graph_expand.expand_neighbors(
        REPO_ID,
        [seed],
        "order discount",
        direction="callers",
        include_imports=True,
    )

    names = {item.chunk.qualified_name for item in results}
    assert "shop.catalog" in names
    assert "shop.discounts" in names
    assert all(
        item.chunk.node_type == "module_header"
        for item in results
        if item.chunk.qualified_name
        in {"shop.catalog", "shop.discounts"}
    )


def test_non_positive_limit_returns_empty():
    seed = make_chunk("shop.orders.create_order")

    assert graph_expand.expand_neighbors(
        REPO_ID, [seed], "order", m=0
    ) == []


def test_invalid_direction_raises_value_error():
    seed = make_chunk("shop.orders.create_order")

    with pytest.raises(ValueError):
        graph_expand.expand_neighbors(
            REPO_ID, [seed], "order", direction="sideways"
        )
