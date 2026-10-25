"""Tests for repository management endpoints and registry."""

from fastapi.testclient import TestClient

from app import ingest_service


def test_registry_operations(tmp_path, monkeypatch):
    """Test create, get, update, and list registry functions."""
    test_registry_file = tmp_path / "repos.json"
    monkeypatch.setattr(ingest_service, "REGISTRY_PATH", test_registry_file)

    # 1. create_repo
    status = ingest_service.create_repo("https://github.com/pallets/flask")
    assert status.repo_id == "pallets__flask"
    assert status.state == "queued"

    # 2. get_status
    fetched = ingest_service.get_status("pallets__flask")
    assert fetched is not None
    assert fetched.repo_id == "pallets__flask"
    assert fetched.state == "queued"

    # 3. update_status
    updated = ingest_service.update_status("pallets__flask", state="ready", files=42)
    assert updated is not None
    assert updated.state == "ready"
    assert updated.files == 42

    # 4. list_repos
    all_repos = ingest_service.list_repos()
    assert len(all_repos) == 1
    assert all_repos[0].repo_id == "pallets__flask"


def test_post_repos_invalid_url(client: TestClient):
    """POST /repos returns 400 for non-GitHub or malformed URLs."""
    response = client.post("/repos", json={"repo_url": "https://gitlab.com/owner/repo"})
    assert response.status_code == 400
    assert "Invalid" in response.json()["detail"] or "Must start" in response.json()["detail"]


def test_post_repos_valid_starts_background_task(client: TestClient, tmp_path, monkeypatch):
    """POST /repos returns 202 and registers repo in queued state."""
    test_registry_file = tmp_path / "repos.json"
    monkeypatch.setattr(ingest_service, "REGISTRY_PATH", test_registry_file)

    called_task = {}

    def fake_run_ingestion_task(source: str, repo_id: str, **kwargs):
        called_task["source"] = source
        called_task["repo_id"] = repo_id

    monkeypatch.setattr("app.api.routes.run_ingestion_task", fake_run_ingestion_task)

    response = client.post("/repos", json={"repo_url": "https://github.com/pallets/click"})
    assert response.status_code == 202
    assert response.json() == {"repo_id": "pallets__click"}

    status = ingest_service.get_status("pallets__click")
    assert status is not None
    assert status.repo_id == "pallets__click"


def test_get_repos_and_status(client: TestClient, tmp_path, monkeypatch):
    """GET /repos and GET /repos/{repo_id}/status."""
    test_registry_file = tmp_path / "repos.json"
    monkeypatch.setattr(ingest_service, "REGISTRY_PATH", test_registry_file)

    ingest_service.create_repo("https://github.com/pallets/jinja")

    # List all
    res_list = client.get("/repos")
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1
    assert res_list.json()[0]["repo_id"] == "pallets__jinja"

    # Get specific existing
    res_one = client.get("/repos/pallets__jinja/status")
    assert res_one.status_code == 200
    assert res_one.json()["repo_id"] == "pallets__jinja"
    assert res_one.json()["state"] == "queued"

    # Get nonexistent -> 404
    res_missing = client.get("/repos/missing__repo/status")
    assert res_missing.status_code == 404


def test_post_reindex(client: TestClient, tmp_path, monkeypatch):
    """POST /repos/{repo_id}/reindex triggers fresh ingestion or returns 404."""
    test_registry_file = tmp_path / "repos.json"
    monkeypatch.setattr(ingest_service, "REGISTRY_PATH", test_registry_file)

    # 404 for unknown
    res_404 = client.post("/repos/unknown__repo/reindex")
    assert res_404.status_code == 404

    # 202 for known
    ingest_service.create_repo("https://github.com/pallets/werkzeug")
    monkeypatch.setattr("app.api.routes.run_ingestion_task", lambda *args, **kwargs: None)

    res_202 = client.post("/repos/pallets__werkzeug/reindex")
    assert res_202.status_code == 202
    assert res_202.json() == {"repo_id": "pallets__werkzeug"}


def test_ingestion_task_failure_handling(tmp_path, monkeypatch):
    """If ingestion raises an exception, state becomes failed with error message."""
    test_registry_file = tmp_path / "repos.json"
    monkeypatch.setattr(ingest_service, "REGISTRY_PATH", test_registry_file)

    ingest_service.create_repo("https://github.com/error/repo")

    def failing_ingest(*args, **kwargs):
        raise RuntimeError("Cloning network timeout")

    monkeypatch.setattr(ingest_service, "ingest_repository", failing_ingest)

    ingest_service.run_ingestion_task("https://github.com/error/repo", "error__repo")

    status = ingest_service.get_status("error__repo")
    assert status is not None
    assert status.state == "failed"
    assert status.error == "Cloning network timeout"


def test_ingest_repository_progress_callback(tmp_path, monkeypatch):
    """ingest_repository invokes on_progress with stages."""
    repo_dir = tmp_path / "dummy_repo"
    repo_dir.mkdir()
    (repo_dir / "app.py").write_text("x = 1\n", encoding="utf-8")

    stages = []

    def callback(state: str, **counts):
        stages.append((state, counts))

    summary = ingest_service.ingest_repository(
        source=repo_dir,
        repo_id="dummy_repo",
        chunker="naive",
        build_graph=False,
        on_progress=callback,
    )

    stage_names = [s[0] for s in stages]
    assert "ingesting" in stage_names
    assert "chunking" in stage_names
    assert "indexing" in stage_names
    assert summary["files"] == 1
    assert summary["chunks"] >= 1
