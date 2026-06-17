from unittest.mock import MagicMock, patch

from lib.storage import upload_report_pdf


def test_upload_report_pdf_uploads_to_user_scoped_path():
    mock_client = MagicMock()
    with patch("lib.storage.get_supabase", return_value=mock_client):
        path = upload_report_pdf("user-1", "scan-1", b"%PDF-1.7 fake")

    assert path == "user-1/scan-1.pdf"
    mock_client.storage.from_.assert_called_once_with("reports")
    upload_call = mock_client.storage.from_.return_value.upload
    upload_call.assert_called_once()
    args, _ = upload_call.call_args
    assert args[0] == "user-1/scan-1.pdf"
    assert args[1] == b"%PDF-1.7 fake"
