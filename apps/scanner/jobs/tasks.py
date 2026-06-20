from datetime import datetime, timezone

from lib import consent
from lib import repo_consent
from lib.activity import log_event
from lib.badges import issue_badge
from lib.github_app import mint_installation_token
from lib.settings import settings
from lib.storage import upload_report_pdf
from lib.supabase import get_supabase
from reports.grader import grade
from reports.renderer import render_report_pdf
from scanners.headers import HeadersScanner
from scanners.tls import TLSScanner
from scanners.supabase_exposure import SupabaseExposureScanner
from scanners.storage_exposure import StorageExposureScanner
from scanners.secrets import SecretsScanner
from scanners.rate_limit import RateLimitScanner
from scanners.nuclei import NucleiScanner
from scanners.github_secrets import GitHubSecretsScanner
from jobs.config import celery_app


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_BADGE_TIERS = {"active", "deep"}


def _format_date(iso: str) -> str:
    """'2026-07-18T…' -> 'Jul 18, 2026'. Avoids strftime('%-d'), which is not
    portable to Windows where the test suite runs."""
    dt = datetime.fromisoformat(iso)
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _mark_scan(scan_id: str, **fields) -> None:
    get_supabase().table("scans").update(fields).eq("id", scan_id).execute()


def _scanners_for_tier(scan_type: str) -> list:
    """Cumulative tiers: active runs everything passive runs, plus more;
    deep runs everything active runs, plus more.

    The lists below are built fresh on every call (not module-level
    constants) so that `unittest.mock.patch("jobs.tasks.HeadersScanner")`
    and friends still take effect in tests — patching rebinds the bare
    name in this module's globals, and that rebinding is only picked up
    if the lookup happens at call time."""
    passive = [HeadersScanner, TLSScanner]
    active = [*passive, SupabaseExposureScanner, StorageExposureScanner, SecretsScanner, RateLimitScanner]
    deep = [*active, NucleiScanner]

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
        log_event(user_id, "scan_failed", url_id=url_id, scan_id=scan_id,
                  payload={"detail": "ownership verification failed"})
        raise  # Do not retry consent errors

    # First attempt only — avoid duplicate feed entries when Celery retries.
    if task_self.request.retries == 0:
        log_event(user_id, "scan_started", url_id=url_id, scan_id=scan_id,
                  payload={"url": url, "detail": f"{scan_type} scan"})

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

        # PDF generation is best-effort: a rendering failure shouldn't fail a
        # scan whose security findings are already written to the DB.
        try:
            pdf_bytes = render_report_pdf(
                url,
                {"id": scan_id, "scan_type": scan_type, "grade": letter, "score": score},
                [f.to_dict() for f in findings],
            )
            pdf_storage_path = upload_report_pdf(user_id, scan_id, pdf_bytes)
        except Exception:
            pdf_storage_path = None

        _mark_scan(
            scan_id,
            status="completed",
            grade=letter,
            score=score,
            completed_at=_now(),
            scanner_version=settings.scanner_version,
            pdf_storage_path=pdf_storage_path,
        )

        log_event(user_id, "scan_completed", url_id=url_id, scan_id=scan_id,
                  payload={"url": url, "grade": letter, "score": score,
                           "detail": f"Grade {letter} · {scan_type} scan"})

        if scan_type in _BADGE_TIERS:
            # Best-effort, like PDF rendering above: a badge write failure must
            # not undo an already-completed scan or trigger a full re-scan.
            try:
                badge = issue_badge(url_id, scan_id)
                log_event(user_id, "badge_issued", url_id=url_id, scan_id=scan_id,
                          payload={"url": url, "grade": letter,
                                   "expires_at": badge["expires_at"],
                                   "detail": f"Valid until {_format_date(badge['expires_at'])}"})
            except Exception:
                pass

    except Exception as exc:
        _mark_scan(scan_id, status="failed", completed_at=_now())
        if task_self.request.retries >= task_self.max_retries:
            log_event(user_id, "scan_failed", url_id=url_id, scan_id=scan_id,
                      payload={"url": url, "detail": "scan error"})
        raise task_self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def run_scan(self, scan_id: str, url_id: str, scan_type: str, user_id: str) -> None:
    _execute_scan(self, scan_id, url_id, scan_type, user_id)


def _mark_repo_scan(repo_scan_id: str, **fields) -> None:
    get_supabase().table("repo_scans").update(fields).eq("id", repo_scan_id).execute()


def _execute_repo_scan(task_self, repo_scan_id: str, repo_id: str, user_id: str) -> None:
    """Run one committed-secret scan for a connected repo. Mirrors _execute_scan:
    authorization gate first, then mint token → clone → gitleaks → redacted
    findings, with the same retry/failure policy."""
    _mark_repo_scan(repo_scan_id, status="running", started_at=_now())

    try:
        repo = repo_consent.verify(repo_id, user_id)
    except repo_consent.RepoConsentError:
        _mark_repo_scan(repo_scan_id, status="failed", completed_at=_now())
        log_event(user_id, "repo_scan_failed", scan_id=repo_scan_id,
                  payload={"detail": "repo authorization failed"})
        raise  # do not retry authorization errors

    if task_self.request.retries == 0:
        log_event(user_id, "repo_scan_started", scan_id=repo_scan_id,
                  payload={"repo": repo["full_name"]})

    try:
        token = mint_installation_token(
            repo["installation_id"], repository_ids=[repo["github_repo_id"]]
        )
        clone_url = f"https://x-access-token:{token}@github.com/{repo['full_name']}.git"
        scanner = GitHubSecretsScanner(
            clone_url=clone_url, token=token, base_sha=repo["last_scanned_sha"]
        )
        result = scanner.run()

        if result.findings:
            get_supabase().table("repo_findings").insert([
                {**f, "repo_scan_id": repo_scan_id, "user_id": user_id,
                 "first_seen_at": _now()}
                for f in result.findings
            ]).execute()

        get_supabase().table("repos").update(
            {"last_scanned_sha": result.head_sha, "last_scan_at": _now()}
        ).eq("id", repo_id).execute()

        _mark_repo_scan(
            repo_scan_id,
            status="completed",
            mode=result.mode,
            base_sha=result.base_sha,
            head_sha=result.head_sha,
            secrets_found=len(result.findings),
            scanner_version=settings.scanner_version,
            completed_at=_now(),
        )

        log_event(user_id, "repo_scan_completed", scan_id=repo_scan_id,
                  payload={"repo": repo["full_name"], "mode": result.mode,
                           "clone_url": scanner.safe_clone_url(),
                           "secrets_found": len(result.findings),
                           "detail": f"{len(result.findings)} secret(s) · {result.mode} scan"})

    except Exception as exc:
        _mark_repo_scan(repo_scan_id, status="failed", completed_at=_now())
        if task_self.request.retries >= task_self.max_retries:
            log_event(user_id, "repo_scan_failed", scan_id=repo_scan_id,
                      payload={"repo": repo["full_name"], "detail": "scan error"})
        raise task_self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def run_repo_scan(self, repo_scan_id: str, repo_id: str, user_id: str) -> None:
    _execute_repo_scan(self, repo_scan_id, repo_id, user_id)
