
"""API endpoint tests for the Codebase QA service."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import ingest_service
from app.models import Answer


@pytest.fixture
def ready_repo(tmp_path, monkeypatch):
    """Register a ready repository with a temporary source directory."""
    registry_path = tmp_path / "repos.json"
    repo_id = "test__repo"
    repo_dir = tmp_path / "repos" / repo_id
    repo_dir.mkdir(parents=True)

    (repo_dir / "example.py").write_text(
        "first line\nsecond line\nthird line\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(ingest_service, "REGISTRY_PATH", registry_path)
    monkeypatch.setattr("app.api.routes.settings.REPOS_DIR", str(tmp_path / "repos"))

    ingest_service.create_repo("https://github.com/test/repo")
    ingest_service.update_status(repo_id, state="ready", chunks=1)

    return repo_id, repo_dir


def test_health_endpoint(client: TestClient):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_invalid_github_url_returns_400(client: TestClient):
    response = client.post(
        "/repos",
        json={"repo_url": "https://gitlab.com/test/repo"},
    )

    assert response.status_code == 400


def test_query_unknown_repository_returns_404(client: TestClient):
    response = client.post(
        "/query",
        json={
            "repo_id": "missing__repo",
            "question": "How does this work?",
            "mode": "baseline",
        },
    )

    assert response.status_code == 404


def test_query_repository_not_ready_returns_409(
    client: TestClient,
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(
        ingest_service,
        "REGISTRY_PATH",
        tmp_path / "repos.json",
    )
    ingest_service.create_repo("https://github.com/test/pending")

    response = client.post(
        "/query",
        json={
            "repo_id": "test__pending",
            "question": "How does this work?",
            "mode": "baseline",
        },
    )

    assert response.status_code == 409


@pytest.mark.parametrize("question", ["", "  ", "hi", "x" * 1001])
def test_query_invalid_question_returns_422(
    client: TestClient,
    ready_repo,
    question: str,
):
    repo_id, _ = ready_repo

    response = client.post(
        "/query",
        json={
            "repo_id": repo_id,
            "question": question,
            "mode": "baseline",
        },
    )

    assert response.status_code == 422


def test_adaptive_query_returns_501(
    client: TestClient,
    ready_repo,
):
    repo_id, _ = ready_repo

    response = client.post(
        "/query",
        json={
            "repo_id": repo_id,
            "question": "How does this work?",
            "mode": "adaptive",
        },
    )

    assert response.status_code == 501


def test_code_endpoint_returns_numbered_lines(
    client: TestClient,
    ready_repo,
):
    repo_id, _ = ready_repo

    response = client.get(
        f"/repos/{repo_id}/code",
        params={"file": "example.py", "start": 2, "end": 3},
    )

    assert response.status_code == 200
    assert response.json()["lines"] == [
        {"n": 2, "text": "second line"},
        {"n": 3, "text": "third line"},
    ]


def test_code_endpoint_missing_file_returns_404(
    client: TestClient,
    ready_repo,
):
    repo_id, _ = ready_repo

    response = client.get(
        f"/repos/{repo_id}/code",
        params={"file": "missing.py", "start": 1, "end": 2},
    )

    assert response.status_code == 404


def test_code_endpoint_rejects_path_traversal(
    client: TestClient,
    ready_repo,
):
    repo_id, repo_dir = ready_repo
    outside_file = repo_dir.parent / "secret.txt"
    outside_file.write_text("secret content", encoding="utf-8")

    response = client.get(
        f"/repos/{repo_id}/code",
        params={"file": "../secret.txt", "start": 1, "end": 1},
    )

    assert response.status_code == 400
    assert "secret content" not in response.text


def test_query_success_uses_mocked_pipeline(
    client: TestClient,
    ready_repo,
    monkeypatch,
):
    repo_id, _ = ready_repo
    called = {}

    expected = Answer(
        text="The answer is available.",
        citations=[],
        retrieved=[],
        low_confidence=False,
        unsupported_items=[],
        mode="baseline",
        latency_ms=5,
        tokens_used=0,
    )

    def fake_run_query(request):
        called["repo_id"] = request.repo_id
        called["question"] = request.question
        return expected

    monkeypatch.setattr("app.api.routes.run_query", fake_run_query)

    response = client.post(
        "/query",
        json={
            "repo_id": repo_id,
            "question": "How does this work?",
            "mode": "baseline",
        },
    )

    assert response.status_code == 200
    assert response.json()["text"] == expected.text
    assert called == {
        "repo_id": repo_id,
        "question": "How does this work?",
    }
