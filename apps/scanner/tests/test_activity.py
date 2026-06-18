from unittest.mock import MagicMock, patch


def test_log_event_inserts_expected_row():
    with patch("lib.activity.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        from lib.activity import log_event
        log_event(
            "user-1", "scan_started",
            url_id="url-1", scan_id="scan-1",
            payload={"url": "https://example.com", "detail": "active scan"},
        )
    client.table.assert_called_once_with("activity_log")
    inserted = client.table.return_value.insert.call_args[0][0]
    assert inserted["user_id"] == "user-1"
    assert inserted["event_type"] == "scan_started"
    assert inserted["url_id"] == "url-1"
    assert inserted["scan_id"] == "scan-1"
    assert inserted["payload"] == {"url": "https://example.com", "detail": "active scan"}


def test_log_event_defaults_payload_to_empty_dict():
    with patch("lib.activity.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        from lib.activity import log_event
        log_event("user-1", "scan_completed")
    inserted = client.table.return_value.insert.call_args[0][0]
    assert inserted["payload"] == {}
    assert inserted["url_id"] is None


def test_log_event_swallows_errors():
    with patch("lib.activity.get_supabase", side_effect=RuntimeError("db down")):
        from lib.activity import log_event
        log_event("user-1", "scan_started")  # must not raise
