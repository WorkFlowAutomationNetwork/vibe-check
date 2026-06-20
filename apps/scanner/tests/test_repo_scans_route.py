from unittest.mock import patch
from fastapi.testclient import TestClient


def _client():
    from api.main import app
    return TestClient(app)


def test_enqueue_repo_scan_requires_internal_key():
    res = _client().post("/api/repo-scans", json={
        "repo_scan_id": "s", "repo_id": "r", "user_id": "u"})
    assert res.status_code in (401, 422)


def test_enqueue_repo_scan_dispatches():
    with patch("api.routes.repo_scans.run_repo_scan.delay") as delay:
        res = _client().post(
            "/api/repo-scans",
            headers={"X-Internal-Key": "test-internal-key"},
            json={"repo_scan_id": "s", "repo_id": "r", "user_id": "u"},
        )
    assert res.status_code == 202
    assert res.json() == {"job_id": "s"}
    delay.assert_called_once_with("s", "r", "u")
