"""Health check endpoint tests."""
from fastapi.testclient import TestClient


def test_health_check(client: TestClient) -> None:
    """Verify that GET /health returns status 200 and {'status': 'ok'}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
