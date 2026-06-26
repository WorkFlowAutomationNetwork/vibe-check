from unittest.mock import patch, MagicMock

import pytest

from jobs.tasks import _execute_scan


class _FakeSelf:
    class request:
        retries = 0
    max_retries = 3

    def retry(self, exc):
        raise exc


def _make_mock_scanner(findings):
    m = MagicMock()
    m.return_value.run.return_value = findings
    return m


@pytest.fixture(autouse=True)
def _patch_common(monkeypatch):
    monkeypatch.setattr("jobs.tasks.consent.verify", lambda url_id: "https://example.com")
    monkeypatch.setattr("jobs.tasks._mark_scan", lambda scan_id, **kw: None)
    monkeypatch.setattr("jobs.tasks.log_event", lambda *a, **kw: None)
    monkeypatch.setattr("jobs.tasks.grade", lambda findings: ("B", 75))
    monkeypatch.setattr("jobs.tasks.render_report_pdf", lambda *a, **kw: b"pdf")
    monkeypatch.setattr("jobs.tasks.upload_report_pdf", lambda *a, **kw: "path/to.pdf")
    monkeypatch.setattr("jobs.tasks.issue_badge", lambda *a, **kw: {"expires_at": "2027-01-01T00:00:00"})
    monkeypatch.setattr(
        "jobs.tasks._scanners_for_tier",
        lambda scan_type: [_make_mock_scanner([])],
    )


def test_notify_posted_when_web_notify_url_set(monkeypatch):
    monkeypatch.setattr("jobs.tasks.settings.web_notify_url", "https://app.example.com")
    monkeypatch.setattr("jobs.tasks.settings.scanner_internal_key", "secret-key")

    with patch("httpx.post") as mock_post:
        _execute_scan(_FakeSelf(), "scan-1", "url-1", "active", "user-1")

    mock_post.assert_called_once()
    call_args, call_kwargs = mock_post.call_args
    assert call_args[0] == "https://app.example.com/api/notify/scan-complete"
    payload = call_kwargs["json"]
    assert payload["scan_id"] == "scan-1"
    assert payload["user_id"] == "user-1"
    assert payload["grade"] == "B"
    assert "has_critical" in payload


def test_notify_skipped_when_web_notify_url_empty(monkeypatch):
    monkeypatch.setattr("jobs.tasks.settings.web_notify_url", "")

    with patch("httpx.post") as mock_post:
        _execute_scan(_FakeSelf(), "scan-1", "url-1", "active", "user-1")

    mock_post.assert_not_called()


def test_notify_error_does_not_fail_scan(monkeypatch):
    monkeypatch.setattr("jobs.tasks.settings.web_notify_url", "https://app.example.com")
    monkeypatch.setattr("jobs.tasks.settings.scanner_internal_key", "secret-key")

    with patch("httpx.post", side_effect=Exception("network error")):
        # Should not raise — scan completes normally
        _execute_scan(_FakeSelf(), "scan-1", "url-1", "active", "user-1")
