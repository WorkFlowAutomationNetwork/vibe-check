import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

VALID_KEY = "test-internal-key"
HEADERS = {"X-Internal-Key": VALID_KEY}


@pytest.fixture
def client():
    with patch("api.routes.scans.run_scan") as mock_task:
        mock_task.delay.return_value = MagicMock(id="celery-job-id")
        from api.main import app
        yield TestClient(app), mock_task


def test_health_returns_ok(client):
    tc, _ = client
    resp = tc.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "version" in resp.json()


def test_post_scan_missing_key_returns_error(client):
    tc, _ = client
    resp = tc.post("/api/scans", json={
        "scan_id": "scan-uuid-1234",
        "url_id": "url-uuid-1234",
        "scan_type": "passive",
        "user_id": "user-uuid-1",
    })
    # FastAPI returns 422 for missing required header
    assert resp.status_code in (401, 422)


def test_post_scan_wrong_key_returns_401(client):
    tc, _ = client
    resp = tc.post(
        "/api/scans",
        json={"scan_id": "scan-uuid-1234", "url_id": "url-uuid-1234", "scan_type": "passive", "user_id": "user-uuid-1"},
        headers={"X-Internal-Key": "wrong-key"},
    )
    assert resp.status_code == 401


def test_post_scan_valid_returns_202(client):
    tc, mock_task = client
    resp = tc.post(
        "/api/scans",
        json={"scan_id": "scan-uuid-1234", "url_id": "url-uuid-1234", "scan_type": "passive", "user_id": "user-uuid-1"},
        headers=HEADERS,
    )
    assert resp.status_code == 202
    assert resp.json()["job_id"] == "scan-uuid-1234"
    mock_task.delay.assert_called_once_with(
        "scan-uuid-1234", "url-uuid-1234", "passive", "user-uuid-1"
    )


def test_post_scan_invalid_scan_type_returns_422(client):
    tc, _ = client
    resp = tc.post(
        "/api/scans",
        json={"scan_id": "scan-uuid-1234", "url_id": "url-uuid-1234", "scan_type": "invalid", "user_id": "user-uuid-1"},
        headers=HEADERS,
    )
    assert resp.status_code == 422
