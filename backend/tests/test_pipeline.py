"""Tests for end-to-end question answering pipeline and dispatching."""

from app.models import Answer, Chunk, QueryRequest, RetrievedItem
from app import pipeline


def make_item(name: str = "example.func", score: float = 0.85) -> RetrievedItem:
    chunk = Chunk(
        id=name,
        repo_id="test_repo",
        file_path="src/example.py",
        start_line=10,
        end_line=20,
        node_type="function",
        name=name.split(".")[-1],
        qualified_name=name,
        code="def func(): pass",
    )
    return RetrievedItem(
        chunk=chunk,
        score=score,
        source="semantic",
        via=None,
        rank=1,
    )


def test_answer_hybrid_builds_answer(monkeypatch):
    """answer_hybrid retrieves items, builds prompt, calls LLM, and parses citations."""
    mock_item = make_item()

    monkeypatch.setattr(
        pipeline,
        "retrieve_hybrid",
        lambda repo_id, question, k, m, direction: [mock_item],
    )
    monkeypatch.setattr(
        pipeline,
        "generate",
        lambda prompt, system: ("See [src/example.py:10-20].", 150),
    )

    answer = pipeline.answer_hybrid("test_repo", "how does func work?")

    assert isinstance(answer, Answer)
    assert answer.mode == "hybrid"
    assert answer.tokens_used == 150
    assert len(answer.retrieved) == 1
    assert len(answer.citations) == 1
    assert answer.citations[0].valid is True
    assert answer.latency_ms >= 0


def test_run_query_dispatches_to_hybrid(monkeypatch):
    """run_query dispatches hybrid mode requests to answer_hybrid."""
    called = {}

    def fake_answer_hybrid(repo_id: str, question: str) -> Answer:
        called["repo_id"] = repo_id
        called["question"] = question
        return Answer(
            text="mocked answer",
            citations=[],
            retrieved=[],
            low_confidence=False,
            unsupported_items=[],
            mode="hybrid",
            latency_ms=10,
            tokens_used=50,
        )

    monkeypatch.setattr(pipeline, "answer_hybrid", fake_answer_hybrid)

    request = QueryRequest(repo_id="repo123", question="explain flow", mode="hybrid")
    answer = pipeline.run_query(request)

    assert called["repo_id"] == "repo123"
    assert called["question"] == "explain flow"
    assert answer.mode == "hybrid"
