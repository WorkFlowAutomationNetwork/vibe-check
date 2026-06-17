import pytest
from unittest.mock import MagicMock, patch
from lib.consent import ConsentError


class FakeSelf:
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
         patch("jobs.tasks.SupabaseExposureScanner") as ms:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        ms.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "active", "user-1")

    ms.assert_called_once_with("https://example.com")


def test_deep_scan_runs_supabase_exposure_scanner(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        ms.return_value.run.return_value = []
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


def test_deep_tier_matches_active_tier():
    """Encodes the invariant that `deep` is currently a pure extension of
    `active` — if someone adds a scanner to one tier's list without
    updating the other, this test catches the drift."""
    from jobs.tasks import _scanners_for_tier
    assert _scanners_for_tier("deep") == _scanners_for_tier("active")
