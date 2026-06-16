from datetime import datetime, timezone

from lib import consent
from lib.settings import settings
from lib.supabase import get_supabase
from reports.grader import grade
from scanners.headers import HeadersScanner
from scanners.tls import TLSScanner
from scanners.supabase_exposure import SupabaseExposureScanner
from jobs.config import celery_app


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mark_scan(scan_id: str, **fields) -> None:
    get_supabase().table("scans").update(fields).eq("id", scan_id).execute()


def _scanners_for_tier(scan_type: str) -> list:
    """Cumulative tiers: active runs everything passive runs, plus more;
    deep runs everything active runs, plus more (currently identical to
    active — this is the seam for future intrusive scanners).

    The lists below are built fresh on every call (not module-level
    constants) so that `unittest.mock.patch("jobs.tasks.HeadersScanner")`
    and friends still take effect in tests — patching rebinds the bare
    name in this module's globals, and that rebinding is only picked up
    if the lookup happens at call time."""
    passive = [HeadersScanner, TLSScanner]
    active = [*passive, SupabaseExposureScanner]
    deep = [*active]  # no deep-only scanners yet — seam for Nuclei etc.

    tiers = {
        "passive": passive,
        "active": active,
        "deep": deep,
    }
    return tiers.get(scan_type, passive)


def _execute_scan(task_self, scan_id: str, url_id: str, scan_type: str, user_id: str) -> None:
    """Business logic for a scan job — separated so tests can call it directly."""
    _mark_scan(scan_id, status="running", started_at=_now())

    try:
        url = consent.verify(url_id)
    except consent.ConsentError:
        _mark_scan(scan_id, status="failed", completed_at=_now())
        raise  # Do not retry consent errors

    try:
        findings = [
            f
            for scanner_cls in _scanners_for_tier(scan_type)
            for f in scanner_cls(url).run()
        ]

        if findings:
            get_supabase().table("findings").insert([
                {**f.to_dict(), "scan_id": scan_id, "first_seen_at": _now()}
                for f in findings
            ]).execute()

        letter, score = grade(findings)

        _mark_scan(
            scan_id,
            status="completed",
            grade=letter,
            score=score,
            completed_at=_now(),
            scanner_version=settings.scanner_version,
        )

    except Exception as exc:
        _mark_scan(scan_id, status="failed", completed_at=_now())
        raise task_self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def run_scan(self, scan_id: str, url_id: str, scan_type: str, user_id: str) -> None:
    _execute_scan(self, scan_id, url_id, scan_type, user_id)
