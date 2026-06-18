import pytest
from unittest.mock import MagicMock, patch
from lib.consent import ConsentError


class FakeSelf:
    max_retries = 3

    def __init__(self, retries=0):
        self.request = MagicMock(retries=retries)
        self.max_retries = 3

    def retry(self, exc):
        raise exc


@pytest.fixture
def mock_sb():
    with patch("jobs.tasks.get_supabase") as mock:
        client = MagicMock()
        client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
        client.table.return_value.insert.return_value.execute.return_value = MagicMock()
        mock.return_value = client
        yield client


@pytest.fixture
def mock_consent_ok():
    with patch("jobs.tasks.consent.verify", return_value="https://example.com"):
        yield


@pytest.fixture
def mock_scanners_empty():
    with patch("jobs.tasks.HeadersScanner") as mh, patch("jobs.tasks.TLSScanner") as mt:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        yield


@pytest.fixture(autouse=True)
def mock_pdf_pipeline():
    with patch("jobs.tasks.render_report_pdf", return_value=b"%PDF-1.7 fake") as mr, \
         patch("jobs.tasks.upload_report_pdf", return_value="user-1/scan-1.pdf") as mu:
        yield mr, mu


def test_run_scan_marks_running_then_completed(mock_sb, mock_consent_ok, mock_scanners_empty):
    from jobs.tasks import _execute_scan
    _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")
    tables_called = [c[0][0] for c in mock_sb.table.call_args_list]
    assert "scans" in tables_called


def test_run_scan_aborts_on_consent_error(mock_sb, mock_scanners_empty):
    with patch("jobs.tasks.consent.verify", side_effect=ConsentError("not verified")):
        from jobs.tasks import _execute_scan
        with pytest.raises(ConsentError):
            _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    update_calls = str(mock_sb.table.return_value.update.call_args_list)
    assert "failed" in update_calls


def test_run_scan_inserts_findings_when_present(mock_sb, mock_consent_ok):
    from scanners.base import Finding
    from jobs.tasks import _execute_scan

    finding = Finding(
        check_name="test-check",
        severity="critical",
        category="Test",
        title="Test",
        description="d",
        what_we_did="w",
        remediation="r",
    )
    with patch("jobs.tasks.HeadersScanner") as mh, patch("jobs.tasks.TLSScanner") as mt:
        mh.return_value.run.return_value = [finding]
        mt.return_value.run.return_value = []
        _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    mock_sb.table.return_value.insert.assert_called_once()
    inserted = mock_sb.table.return_value.insert.call_args[0][0]
    assert len(inserted) == 1
    assert inserted[0]["severity"] == "critical"
    assert inserted[0]["scan_id"] == "scan-1"


def test_run_scan_skips_insert_when_no_findings(mock_sb, mock_consent_ok, mock_scanners_empty):
    from jobs.tasks import _execute_scan
    _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")
    mock_sb.table.return_value.insert.assert_not_called()


def test_run_scan_marks_failed_on_unexpected_error(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh:
        mh.return_value.run.side_effect = RuntimeError("unexpected")
        from jobs.tasks import _execute_scan
        with pytest.raises(RuntimeError):
            _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    update_calls = str(mock_sb.table.return_value.update.call_args_list)
    assert "failed" in update_calls


def test_passive_scan_does_not_run_supabase_exposure_scanner(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    ms.assert_not_called()


def test_active_scan_runs_supabase_exposure_scanner(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms, \
         patch("jobs.tasks.issue_badge",
               return_value={"public_token": "tok",
                             "expires_at": "2026-07-18T00:00:00+00:00"}), \
         patch("jobs.tasks.log_event"):
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        ms.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "active", "user-1")

    ms.assert_called_once_with("https://example.com")


def test_deep_scan_runs_supabase_exposure_scanner(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms, \
         patch("jobs.tasks.NucleiScanner") as mn, \
         patch("jobs.tasks.issue_badge",
               return_value={"public_token": "tok",
                             "expires_at": "2026-07-18T00:00:00+00:00"}), \
         patch("jobs.tasks.log_event"):
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        ms.return_value.run.return_value = []
        mn.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "deep", "user-1")

    ms.assert_called_once_with("https://example.com")


def test_run_scan_uploads_pdf_and_stores_path(mock_sb, mock_consent_ok, mock_scanners_empty, mock_pdf_pipeline):
    from jobs.tasks import _execute_scan
    _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    mock_render, mock_upload = mock_pdf_pipeline
    mock_render.assert_called_once()
    mock_upload.assert_called_once_with("user-1", "scan-1", b"%PDF-1.7 fake")

    update_calls = mock_sb.table.return_value.update.call_args_list
    completed_call = next(c for c in update_calls if c[0][0].get("status") == "completed")
    assert completed_call[0][0]["pdf_storage_path"] == "user-1/scan-1.pdf"


def test_run_scan_completes_even_when_pdf_rendering_fails(mock_sb, mock_consent_ok, mock_scanners_empty):
    from jobs.tasks import _execute_scan
    with patch("jobs.tasks.render_report_pdf", side_effect=RuntimeError("no native libs")):
        _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    update_calls = mock_sb.table.return_value.update.call_args_list
    completed_call = next(c for c in update_calls if c[0][0].get("status") == "completed")
    assert completed_call[0][0]["pdf_storage_path"] is None


def test_active_scan_issues_badge_and_logs_events(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms, \
         patch("jobs.tasks.StorageExposureScanner") as mse, \
         patch("jobs.tasks.SecretsScanner") as msec, \
         patch("jobs.tasks.RateLimitScanner") as mrl, \
         patch("jobs.tasks.issue_badge",
               return_value={"public_token": "tok",
                             "expires_at": "2026-07-18T00:00:00+00:00"}) as mb, \
         patch("jobs.tasks.log_event") as mle:
        for m in (mh, mt, ms, mse, msec, mrl):
            m.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "active", "user-1")

    mb.assert_called_once_with("url-1", "scan-1")
    event_types = [c.args[1] for c in mle.call_args_list]
    assert "scan_started" in event_types
    assert "scan_completed" in event_types
    assert "badge_issued" in event_types
    badge_call = next(c for c in mle.call_args_list if c.args[1] == "badge_issued")
    assert "Valid until" in badge_call.kwargs["payload"]["detail"]


def test_passive_scan_logs_events_but_no_badge(mock_sb, mock_consent_ok, mock_scanners_empty):
    with patch("jobs.tasks.issue_badge") as mb, patch("jobs.tasks.log_event") as mle:
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    mb.assert_not_called()
    event_types = [c.args[1] for c in mle.call_args_list]
    assert "scan_started" in event_types
    assert "scan_completed" in event_types
    assert "badge_issued" not in event_types


def test_consent_failure_logs_scan_failed_only(mock_sb, mock_scanners_empty):
    with patch("jobs.tasks.consent.verify", side_effect=ConsentError("nope")), \
         patch("jobs.tasks.log_event") as mle:
        from jobs.tasks import _execute_scan
        with pytest.raises(ConsentError):
            _execute_scan(FakeSelf(), "scan-1", "url-1", "active", "user-1")

    event_types = [c.args[1] for c in mle.call_args_list]
    assert event_types == ["scan_failed"]


def test_scan_started_not_relogged_on_retry(mock_sb, mock_consent_ok, mock_scanners_empty):
    with patch("jobs.tasks.log_event") as mle, patch("jobs.tasks.issue_badge"):
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(retries=1), "scan-1", "url-1", "passive", "user-1")

    event_types = [c.args[1] for c in mle.call_args_list]
    assert "scan_started" not in event_types
    assert "scan_completed" in event_types


def test_scan_failed_event_only_on_final_retry(mock_sb, mock_consent_ok):
    from jobs.tasks import _execute_scan
    with patch("jobs.tasks.HeadersScanner") as mh, patch("jobs.tasks.log_event") as mle:
        mh.return_value.run.side_effect = RuntimeError("boom")

        with pytest.raises(RuntimeError):
            _execute_scan(FakeSelf(retries=0), "scan-1", "url-1", "passive", "user-1")
        assert "scan_failed" not in [c.args[1] for c in mle.call_args_list]

        mle.reset_mock()
        with pytest.raises(RuntimeError):
            _execute_scan(FakeSelf(retries=3), "scan-1", "url-1", "passive", "user-1")
        assert "scan_failed" in [c.args[1] for c in mle.call_args_list]


def test_badge_failure_does_not_fail_completed_scan(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms, \
         patch("jobs.tasks.StorageExposureScanner") as mse, \
         patch("jobs.tasks.SecretsScanner") as msec, \
         patch("jobs.tasks.RateLimitScanner") as mrl, \
         patch("jobs.tasks.issue_badge", side_effect=RuntimeError("badge db down")), \
         patch("jobs.tasks.log_event") as mle:
        for m in (mh, mt, ms, mse, msec, mrl):
            m.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "active", "user-1")  # must not raise

    statuses = [c[0][0].get("status") for c in mock_sb.table.return_value.update.call_args_list]
    assert "completed" in statuses
    assert "failed" not in statuses
    assert "badge_issued" not in [c.args[1] for c in mle.call_args_list]
