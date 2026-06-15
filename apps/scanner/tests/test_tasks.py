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
        severity="high",
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
    assert inserted[0]["severity"] == "high"
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
