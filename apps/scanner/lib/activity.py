from lib.supabase import get_supabase


def log_event(
    user_id: str,
    event_type: str,
    *,
    url_id: str | None = None,
    scan_id: str | None = None,
    payload: dict | None = None,
) -> None:
    """Append one row to `activity_log` (service-role client — the table has
    no client INSERT policy). Best-effort: logging is observability, not the
    job, so a failure here is swallowed and never propagates."""
    try:
        get_supabase().table("activity_log").insert({
            "user_id": user_id,
            "event_type": event_type,
            "url_id": url_id,
            "scan_id": scan_id,
            "payload": payload or {},
        }).execute()
    except Exception:
        pass
