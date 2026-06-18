# Badge Issuance + Activity-Log Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the badge and activity-feed UIs live by writing `badges` rows and `activity_log` events from the scanner and web app.

**Architecture:** Approach B — dedicated single-purpose helper modules (`lib/activity.py`, `lib/badges.py` in the scanner; `lib/activity.ts` in web). `jobs/tasks.py` and the `urls`/`verify` API routes call these helpers. No schema migrations (tables already exist).

**Tech Stack:** Python 3.12 / Celery / pytest / supabase-py (scanner); Next.js 14 / TypeScript / @supabase/supabase-js (web).

## Global Constraints

- Badge expiry: **30 days fixed** from scan completion.
- Badges issued **only** for `scan_type in {"active", "deep"}`; **any grade**.
- One `active` badge per URL: lapse the prior active badge before inserting a new one.
- Event types must match the feed's map exactly: `scan_started`, `scan_completed`, `scan_failed`, `url_added`, `url_verified`, `badge_issued`.
- Every event sets `payload.url` (string) where known and `payload.detail` (human string).
- All writes are **best-effort**: a logging/badge failure must never change an API response, but the scanner badge call runs inside the scan's normal try/except (a badge failure there will mark the scan failed — acceptable; it is part of scan success).
- `apps/web` has **no test harness** — verify web changes via `npm run type-check` + manual e2e only.
- Scanner code runs on Linux (Docker) but tests run on the developer's Windows machine: **do not use `strftime("%-d")`** (not portable) — format the day manually.
- Service-role client only for `activity_log` / `badges` writes (no client INSERT policy / RLS).

---

### Task 1: Scanner activity-log helper

**Files:**
- Create: `apps/scanner/lib/activity.py`
- Test: `apps/scanner/tests/test_activity.py`

**Interfaces:**
- Consumes: `lib.supabase.get_supabase` (service-role client).
- Produces: `log_event(user_id: str, event_type: str, *, url_id: str | None = None, scan_id: str | None = None, payload: dict | None = None) -> None`

- [ ] **Step 1: Write the failing test**

```python
# apps/scanner/tests/test_activity.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_activity.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.activity'`

- [ ] **Step 3: Write minimal implementation**

```python
# apps/scanner/lib/activity.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/scanner && python -m pytest tests/test_activity.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/lib/activity.py apps/scanner/tests/test_activity.py
git commit -m "feat(scanner): activity_log write helper"
```

---

### Task 2: Scanner badge-issuance helper

**Files:**
- Create: `apps/scanner/lib/badges.py`
- Test: `apps/scanner/tests/test_badges.py`

**Interfaces:**
- Consumes: `lib.supabase.get_supabase`.
- Produces: `issue_badge(url_id: str, scan_id: str, *, days: int = 30) -> dict` returning the inserted row dict with keys `url_id, scan_id, status, public_token, expires_at`.

- [ ] **Step 1: Write the failing test**

```python
# apps/scanner/tests/test_badges.py
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


def test_issue_badge_lapses_prior_then_inserts_active():
    with patch("lib.badges.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        from lib.badges import issue_badge
        row = issue_badge("url-1", "scan-1")

    # supersede: prior active badge for this URL is set to lapsed
    client.table.return_value.update.assert_called_once_with({"status": "lapsed"})

    # new active badge inserted
    inserted = client.table.return_value.insert.call_args[0][0]
    assert inserted["url_id"] == "url-1"
    assert inserted["scan_id"] == "scan-1"
    assert inserted["status"] == "active"
    assert inserted["public_token"]
    assert "expires_at" in inserted

    # returned row carries token + expiry for the badge_issued event
    assert row["public_token"] == inserted["public_token"]
    assert row["expires_at"] == inserted["expires_at"]


def test_issue_badge_expiry_is_about_30_days():
    with patch("lib.badges.get_supabase", return_value=MagicMock()):
        from lib.badges import issue_badge
        row = issue_badge("url-1", "scan-1")
    expires = datetime.fromisoformat(row["expires_at"])
    delta = expires - datetime.now(timezone.utc)
    assert 29 <= delta.days <= 30


def test_issue_badge_tokens_are_unique():
    with patch("lib.badges.get_supabase", return_value=MagicMock()):
        from lib.badges import issue_badge
        a = issue_badge("url-1", "scan-1")
        b = issue_badge("url-1", "scan-2")
    assert a["public_token"] != b["public_token"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_badges.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.badges'`

- [ ] **Step 3: Write minimal implementation**

```python
# apps/scanner/lib/badges.py
import secrets
from datetime import datetime, timedelta, timezone

from lib.supabase import get_supabase


def issue_badge(url_id: str, scan_id: str, *, days: int = 30) -> dict:
    """Issue a fresh active trust badge for a URL.

    Enforces the one-active-badge-per-URL rule (see badges table comment) by
    lapsing any existing active badge first, then inserting a new active row
    with a secret public token and a `days`-day expiry. Returns the inserted
    row so the caller can log a badge_issued event."""
    sb = get_supabase()

    sb.table("badges").update({"status": "lapsed"}) \
        .eq("url_id", url_id).eq("status", "active").execute()

    row = {
        "url_id": url_id,
        "scan_id": scan_id,
        "status": "active",
        "public_token": secrets.token_urlsafe(24),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
    }
    sb.table("badges").insert(row).execute()
    return row
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/scanner && python -m pytest tests/test_badges.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/lib/badges.py apps/scanner/tests/test_badges.py
git commit -m "feat(scanner): badge issuance helper (30-day, supersedes prior)"
```

---

### Task 3: Wire events + badge into the scan task

**Files:**
- Modify: `apps/scanner/jobs/tasks.py`
- Modify: `apps/scanner/tests/test_tasks.py` (update `FakeSelf`, add tests)

**Interfaces:**
- Consumes: `log_event` (Task 1), `issue_badge` (Task 2).
- Produces: updated `_execute_scan(task_self, scan_id, url_id, scan_type, user_id)` — same signature; `task_self` must now expose `task_self.request.retries: int` and `task_self.max_retries: int`.

- [ ] **Step 1: Update `FakeSelf` and write the failing tests**

Replace the `FakeSelf` class at the top of `apps/scanner/tests/test_tasks.py` with:

```python
class FakeSelf:
    max_retries = 3

    def __init__(self, retries=0):
        self.request = MagicMock(retries=retries)
        self.max_retries = 3

    def retry(self, exc):
        raise exc
```

Append these tests to `apps/scanner/tests/test_tasks.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_tasks.py -v`
Expected: New tests FAIL (e.g. `AttributeError`/`ImportError` — `jobs.tasks` has no `log_event`/`issue_badge`); existing tests still pass.

- [ ] **Step 3: Implement the integration**

Replace the import block and `_execute_scan` in `apps/scanner/jobs/tasks.py`. Add these imports near the existing ones:

```python
from lib.activity import log_event
from lib.badges import issue_badge
```

Add this module-level constant and helper after `_now()`:

```python
_BADGE_TIERS = {"active", "deep"}


def _format_date(iso: str) -> str:
    """'2026-07-18T…' -> 'Jul 18, 2026'. Avoids strftime('%-d'), which is not
    portable to Windows where the test suite runs."""
    dt = datetime.fromisoformat(iso)
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"
```

Replace the whole `_execute_scan` function body with:

```python
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
            badge = issue_badge(url_id, scan_id)
            log_event(user_id, "badge_issued", url_id=url_id, scan_id=scan_id,
                      payload={"url": url, "grade": letter,
                               "expires_at": badge["expires_at"],
                               "detail": f"Valid until {_format_date(badge['expires_at'])}"})

    except Exception as exc:
        _mark_scan(scan_id, status="failed", completed_at=_now())
        if task_self.request.retries >= task_self.max_retries:
            log_event(user_id, "scan_failed", url_id=url_id, scan_id=scan_id,
                      payload={"url": url, "detail": "scan error"})
        raise task_self.retry(exc=exc)
```

- [ ] **Step 4: Run the full scanner suite**

Run: `cd apps/scanner && python -m pytest tests/test_tasks.py tests/test_tasks_tiers.py -v`
Expected: PASS (all existing + 5 new task tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/jobs/tasks.py apps/scanner/tests/test_tasks.py
git commit -m "feat(scanner): emit activity events + issue badge on scan lifecycle"
```

---

### Task 4: Web activity-log helper

**Files:**
- Create: `apps/web/lib/activity.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/server`.
- Produces: `logActivity(params: { userId: string; eventType: string; urlId?: string; scanId?: string; payload?: Record<string, unknown> }): Promise<void>`

- [ ] **Step 1: Write the implementation**

(No web test harness exists — verification is `type-check`. Keep the helper small and defensive.)

```typescript
// apps/web/lib/activity.ts
import { createServiceClient } from '@/lib/supabase/server'

interface LogActivityParams {
  userId: string
  eventType: string
  urlId?: string
  scanId?: string
  payload?: Record<string, unknown>
}

/**
 * Append one row to `activity_log`. Uses the service-role client because the
 * table has no client INSERT policy (RLS). Best-effort: a logging failure must
 * never change the API response that triggered it.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('activity_log').insert({
      user_id: params.userId,
      event_type: params.eventType,
      url_id: params.urlId ?? null,
      scan_id: params.scanId ?? null,
      payload: params.payload ?? {},
    })
  } catch {
    // best-effort — swallow
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npm run type-check`
Expected: clean (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/activity.ts
git commit -m "feat(web): logActivity service-role helper"
```

---

### Task 5: Wire `url_added` and `url_verified` into API routes

**Files:**
- Modify: `apps/web/app/api/urls/route.ts`
- Modify: `apps/web/app/api/verify/route.ts`

**Interfaces:**
- Consumes: `logActivity` (Task 4).

- [ ] **Step 1: Edit `urls/route.ts`**

Change the import line:

```typescript
import { createServerClient } from '@/lib/supabase/server'
```

to:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
```

Then, immediately before the final `return NextResponse.json(urlRow, { status: 201 })`, add:

```typescript
  await logActivity({
    userId: user.id,
    eventType: 'url_added',
    urlId: urlRow.id,
    payload: { url: normalized },
  })
```

- [ ] **Step 2: Edit `verify/route.ts`**

Add the import after the existing supabase import:

```typescript
import { logActivity } from '@/lib/activity'
```

Inside the existing `if (verified) { … }` block, after the `serviceClient.from('urls').update(...)` call completes, add:

```typescript
    await logActivity({
      userId: user.id,
      eventType: 'url_verified',
      urlId: urlRow.id,
      payload: { url: urlRow.url, method },
    })
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npm run type-check`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/urls/route.ts apps/web/app/api/verify/route.ts
git commit -m "feat(web): log url_added and url_verified activity events"
```

---

### Task 6: Full verification + status update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the entire scanner suite**

Run: `cd apps/scanner && python -m pytest -q`
Expected: all pass (≈142 prior + new activity/badge/task tests)

- [ ] **Step 2: Web type-check**

Run: `cd apps/web && npm run type-check`
Expected: clean

- [ ] **Step 3: Manual end-to-end (sandbox)**

With web + scanner + Redis + Celery running locally:
1. Add a URL → `/activity` shows **URL added**.
2. Verify ownership → `/activity` shows **URL verified**.
3. Run an **active** scan → on completion `/activity` shows **Scan started**, **Scan completed**, **Badge issued**; `/badge` shows an active badge with a ~30-day expiry; `GET /api/badge/<public_token>` returns `{ "valid": true }`.
4. Run a **passive** scan → start + completed events, **no** badge.

- [ ] **Step 4: Update `PROJECT_STATUS.md`**

In the "Gaps / What to build next" section, remove gap #1 (badge issuance + activity-log writes) and note in the Scanner section that `jobs/tasks.py` now issues badges and writes activity events. Remove the "Not yet written in scanner: badges row creation and activity_log writes" line.

- [ ] **Step 5: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: mark badge issuance + activity-log writes complete"
```

---

## Notes for the implementer

- Run scanner commands from `apps/scanner/` so `lib.*` / `jobs.*` imports resolve (matches `conftest.py`).
- The `mock_sb` fixture patches only `jobs.tasks.get_supabase`; the Task-3 tests patch `jobs.tasks.log_event` / `jobs.tasks.issue_badge` directly, so the helpers' own DB calls are not exercised there (they're covered by Tasks 1–2).
- Do not add a migration — `badges` and `activity_log` already exist with the right columns.
