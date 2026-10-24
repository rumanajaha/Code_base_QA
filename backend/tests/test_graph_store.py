"""Tests for Neo4j graph store operations."""
from __future__ import annotations

import uuid
import pytest

from app.indexing.graph_store import (
    clear_repo,
    ensure_schema,
    callees,
    callers,
    file_imports,
    get_driver,
    graph_counts,
    write_chunks,
    write_edges,
)
from app.models import Chunk, Edge


@pytest.fixture(scope="session")
def neo4j_available():
    """Verify that Neo4j is reachable; skip graph tests if not."""
    try:
        driver = get_driver()
        driver.verify_connectivity()
        return True
    except Exception as exc:
        pytest.skip(f"Neo4j is not available: {exc}")


@pytest.fixture
def test_repo_id(neo4j_available):
    """Provide a unique repo_id for each test and guarantee clean-up."""
    repo_id = f"test_{uuid.uuid4().hex[:8]}"
    ensure_schema()
    try:
        yield repo_id
    finally:
        # Guarantee no data is left behind
        clear_repo(repo_id)
        counts = graph_counts(repo_id)
        assert counts["total_nodes"] == 0, f"Leaked nodes in {repo_id}: {counts}"
        assert counts["total_edges"] == 0, f"Leaked edges in {repo_id}: {counts}"


def _build_sample_graph(repo_id: str) -> tuple[list[Chunk], list[Edge]]:
    """Build a deterministic, small code graph that can be drawn on paper.

    Architecture of sample graph:
    -----------------------------
    Files:
      - shop/order.py
      - shop/payment.py

    Nodes:
      - File: shop/order.py
      - File: shop/payment.py
      - Class: shop.payment.PaymentProcessor
      - Function: shop.order.checkout
      - Function: shop.order.validate_order
      - Function: shop.payment.PaymentProcessor.process_payment (method)
      - Function: shop.payment.charge_card

    CONTAINS:
      - shop/order.py -> shop.order.checkout
      - shop/order.py -> shop.order.validate_order
      - shop/payment.py -> shop.payment.PaymentProcessor
      - shop.payment.PaymentProcessor -> shop.payment.PaymentProcessor.process_payment
      - shop/payment.py -> shop.payment.charge_card

    IMPORTS:
      - shop/order.py -> shop/payment.py

    CALLS:
      - shop.order.checkout -> shop.order.validate_order
      - shop.order.checkout -> shop.payment.PaymentProcessor.process_payment
      - shop.payment.PaymentProcessor.process_payment -> shop.payment.charge_card
    """
    chunks = [
        # File 1 entities
        Chunk(
            id=f"{repo_id}:shop/order.py:10-25",
            repo_id=repo_id,
            file_path="shop/order.py",
            start_line=10,
            end_line=25,
            node_type="function",
            name="checkout",
            qualified_name="shop.order.checkout",
            parent_name=None,
            code="def checkout():\n    validate_order()\n    PaymentProcessor().process_payment()",
        ),
        Chunk(
            id=f"{repo_id}:shop/order.py:30-40",
            repo_id=repo_id,
            file_path="shop/order.py",
            start_line=30,
            end_line=40,
            node_type="function",
            name="validate_order",
            qualified_name="shop.order.validate_order",
            parent_name=None,
            code="def validate_order():\n    return True",
        ),
        # File 2 entities
        Chunk(
            id=f"{repo_id}:shop/payment.py:5-50",
            repo_id=repo_id,
            file_path="shop/payment.py",
            start_line=5,
            end_line=50,
            node_type="class",
            name="PaymentProcessor",
            qualified_name="shop.payment.PaymentProcessor",
            parent_name=None,
            code="class PaymentProcessor:\n    def process_payment(self):\n        charge_card()",
        ),
        Chunk(
            id=f"{repo_id}:shop/payment.py:12-25",
            repo_id=repo_id,
            file_path="shop/payment.py",
            start_line=12,
            end_line=25,
            node_type="method",
            name="process_payment",
            qualified_name="shop.payment.PaymentProcessor.process_payment",
            parent_name="PaymentProcessor",
            code="    def process_payment(self):\n        charge_card()",
        ),
        Chunk(
            id=f"{repo_id}:shop/payment.py:55-65",
            repo_id=repo_id,
            file_path="shop/payment.py",
            start_line=55,
            end_line=65,
            node_type="function",
            name="charge_card",
            qualified_name="shop.payment.charge_card",
            parent_name=None,
            code="def charge_card():\n    pass",
        ),
        # Non-graph chunks (should be ignored by write_chunks)
        Chunk(
            id=f"{repo_id}:shop/order.py:1-5",
            repo_id=repo_id,
            file_path="shop/order.py",
            start_line=1,
            end_line=5,
            node_type="module_header",
            name="order.py",
            qualified_name="shop.order",
            code="import shop.payment",
        ),
        Chunk(
            id=f"{repo_id}:shop/order.py:1-40",
            repo_id=repo_id,
            file_path="shop/order.py",
            start_line=1,
            end_line=40,
            node_type="window",
            name="order.py",
            qualified_name="shop.order:1-40",
            code="...",
        ),
    ]

    edges = [
        # Resolved IMPORTS: (File)->(File)
        Edge(
            repo_id=repo_id,
            source_qualified_name="shop/order.py",
            target_qualified_name="shop/payment.py",
            type="IMPORTS",
            resolved=True,
        ),
        # Resolved CALLS: (Function)->(Function)
        Edge(
            repo_id=repo_id,
            source_qualified_name="shop.order.checkout",
            target_qualified_name="shop.order.validate_order",
            type="CALLS",
            resolved=True,
        ),
        Edge(
            repo_id=repo_id,
            source_qualified_name="shop.order.checkout",
            target_qualified_name="shop.payment.PaymentProcessor.process_payment",
            type="CALLS",
            resolved=True,
        ),
        Edge(
            repo_id=repo_id,
            source_qualified_name="shop.payment.PaymentProcessor.process_payment",
            target_qualified_name="shop.payment.charge_card",
            type="CALLS",
            resolved=True,
        ),
        # Unresolved edge (should be ignored)
        Edge(
            repo_id=repo_id,
            source_qualified_name="shop.order.checkout",
            target_qualified_name="unresolved.third_party_call",
            type="CALLS",
            resolved=False,
        ),
    ]

    return chunks, edges


def test_ensure_schema_is_idempotent(neo4j_available):
    """ensure_schema can be called multiple times without error."""
    ensure_schema()
    ensure_schema()


def test_small_graph_callees_and_callers(test_repo_id):
    """Write sample graph, test predictions for callees/callers, and check counts."""
    chunks, edges = _build_sample_graph(test_repo_id)

    # 1. Ingest chunks and edges
    write_chunks(test_repo_id, chunks)
    write_edges(test_repo_id, edges)

    # 2. Check counts
    counts = graph_counts(test_repo_id)
    assert counts["File"] == 2
    assert counts["Class"] == 1
    assert counts["Function"] == 4
    assert counts["total_nodes"] == 7

    assert counts["CONTAINS"] == 5
    assert counts["CALLS"] == 3
    assert counts["IMPORTS"] == 1
    assert counts["total_edges"] == 9

    # 3. Test callees of checkout -> should be [validate_order, process_payment]
    checkout_callees = callees(test_repo_id, "shop.order.checkout")
    callee_names = [c["qualified_name"] for c in checkout_callees]
    assert sorted(callee_names) == [
        "shop.order.validate_order",
        "shop.payment.PaymentProcessor.process_payment",
    ]
    # Check dict structure
    for c in checkout_callees:
        assert set(c.keys()) == {"qualified_name", "file_path", "start_line", "end_line"}
        assert c["file_path"] in ("shop/order.py", "shop/payment.py")
        assert isinstance(c["start_line"], int)
        assert isinstance(c["end_line"], int)

    # 4. Test callers of process_payment -> should be [checkout]
    proc_callers = callers(test_repo_id, "shop.payment.PaymentProcessor.process_payment")
    assert [c["qualified_name"] for c in proc_callers] == ["shop.order.checkout"]
    assert proc_callers[0]["file_path"] == "shop/order.py"

    # 5. Test callees of process_payment -> should be [charge_card]
    proc_callees = callees(test_repo_id, "shop.payment.PaymentProcessor.process_payment")
    assert [c["qualified_name"] for c in proc_callees] == ["shop.payment.charge_card"]

    # 6. Test callers of charge_card -> should be [process_payment]
    charge_callers = callers(test_repo_id, "shop.payment.charge_card")
    assert [c["qualified_name"] for c in charge_callers] == [
        "shop.payment.PaymentProcessor.process_payment"
    ]

    # 7. Test terminal functions
    assert callees(test_repo_id, "shop.payment.charge_card") == []
    assert callers(test_repo_id, "shop.order.checkout") == []

    # 8. Test file imports
    order_imports = file_imports(test_repo_id, "shop/order.py")
    assert len(order_imports) == 1
    assert order_imports[0]["file_path"] == "shop/payment.py"
    assert set(order_imports[0].keys()) == {
        "qualified_name",
        "file_path",
        "start_line",
        "end_line",
    }


def test_write_chunks_and_edges_idempotency(test_repo_id):
    """Re-writing same chunks and edges does not create duplicates."""
    chunks, edges = _build_sample_graph(test_repo_id)

    write_chunks(test_repo_id, chunks)
    write_edges(test_repo_id, edges)
    first_counts = graph_counts(test_repo_id)

    # Write again
    write_chunks(test_repo_id, chunks)
    write_edges(test_repo_id, edges)
    second_counts = graph_counts(test_repo_id)

    assert first_counts == second_counts


def test_clear_repo_isolation(test_repo_id):
    """clear_repo only cleans the designated repo_id and leaves others intact."""
    other_repo_id = f"test_other_{uuid.uuid4().hex[:8]}"
    chunks_1, edges_1 = _build_sample_graph(test_repo_id)
    chunks_2, edges_2 = _build_sample_graph(other_repo_id)

    try:
        write_chunks(test_repo_id, chunks_1)
        write_edges(test_repo_id, edges_1)

        write_chunks(other_repo_id, chunks_2)
        write_edges(other_repo_id, edges_2)

        # Clear only test_repo_id
        clear_repo(test_repo_id)

        assert graph_counts(test_repo_id)["total_nodes"] == 0
        assert graph_counts(other_repo_id)["total_nodes"] == 7
    finally:
        clear_repo(other_repo_id)
