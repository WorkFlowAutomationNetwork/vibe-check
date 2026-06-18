# Spec: Badge issuance + activity-log writes

**Date:** 2026-06-18
**Status:** Approved (brainstorming) — pending implementation plan
**Gap addressed:** `PROJECT_STATUS.md` → Gaps #1 (badge issuance + activity-log writes)

---

## Problem

The dashboard badge chips, the `/badge` page, `/api/badge/[token]`, and the entire
`/activity` feed are fully built UIs with **no data source**. Nothing in the codebase
ever writes a `badges` row or an `activity_log` event — not the scanner, not the web
API routes. Until these writes ship, those features are permanently empty.

This work makes them live so the app runs end-to-end as if real (Stripe stays in
sandbox; live Stripe products are explicitly out of scope).

## Goals

1. Scanner issues a trust badge when an **active** or **deep** scan completes.
2. Scanner writes `activity_log` events on scan start / complete / fail and badge issue.
3. Web app writes `activity_log` events on `url_added` and `url_verified`.
4. No schema migrations — `badges` and `activity_log` tables already exist.

## Non-goals (out of scope)

- `badge_expired` events (needs a cron; `badge_status` view already computes lapse passively).
- `cve_matched` events (no CVE feed scanner exists).
- Marketing/homepage copy reconciliation (separate gap #3).
- Badge `.svg` image rendering endpoint.
- Live Stripe products/keys.
- Optional `badges(url_id, status)` index (small data; YAGNI for now).

---

## Behaviour decisions (settled in brainstorming)

| Decision | Choice |
|---|---|
| Badge expiry | **30 days fixed** from scan completion. Re-scan resets the clock. Matches marketing "valid 30 days". |
| Activity scope | **Scanner + web events** — full realistic feed from first action. |
| Grade gating | **None** — issue on any completed active/deep scan; the badge displays the grade. |
| Superseding | On issue, set the URL's existing `active` badge to `lapsed`, then insert the new `active` badge (one active badge per URL — table comment requires this). |
| Tier gating | Passive/free scans **never** issue a badge. |

---

## Architecture — Approach B (dedicated helpers)

Keep activity/badge logic in small, single-purpose, independently testable modules that
fit the existing `lib/` convention (`consent.py`, `storage.py`). `tasks.py` and the API
routes only *call* these helpers.

### New: `apps/scanner/lib/activity.py`

```python
def log_event(
    user_id: str,
    event_type: str,
    *,
    url_id: str | None = None,
    scan_id: str | None = None,
    payload: dict | None = None,
) -> None
```

- Inserts one row into `activity_log` via the service-role `get_supabase()` client.
- **Best-effort:** the body is wrapped so a logging failure is swallowed and never
  fails a scan (logging is observability, not the job).

### New: `apps/scanner/lib/badges.py`

```python
def issue_badge(url_id: str, scan_id: str, *, days: int = 30) -> dict
```

1. `update badges set status='lapsed' where url_id=? and status='active'`.
2. Insert new row: `status='active'`, `public_token=secrets.token_urlsafe(24)`,
   `expires_at = now(UTC) + timedelta(days=days)`, `url_id`, `scan_id`.
3. Return the inserted row (needs `public_token`, `expires_at` for the event payload).

### New: `apps/web/lib/activity.ts`

```ts
export async function logActivity(params: {
  userId: string
  eventType: string
  urlId?: string
  scanId?: string
  payload?: Record<string, unknown>
}): Promise<void>
```

- Uses `createServiceClient` — `activity_log` has **no client INSERT policy**, so RLS
  requires the service role.
- Best-effort: swallows errors so a logging failure never changes the API response.

---

## Scanner integration — `apps/scanner/jobs/tasks.py`

`_execute_scan(task_self, scan_id, url_id, scan_type, user_id)` flow:

| Point | Action |
|---|---|
| consent fails | `_mark_scan(failed)` → `log_event(user_id, "scan_failed", url_id=…, scan_id=…, payload={"detail": "ownership verification failed"})` → re-raise (no retry, unchanged) |
| after consent passes, **first attempt only** (`task_self.request.retries == 0`) | `log_event(user_id, "scan_started", url_id, scan_id, payload={"url": url, "detail": f"{scan_type} scan"})` |
| success | `log_event(... "scan_completed", payload={"url": url, "grade": letter, "score": score, "detail": f"Grade {letter} · {scan_type} scan"})`; then **if `scan_type in {"active","deep"}`**: `badge = issue_badge(url_id, scan_id)` → `log_event(... "badge_issued", payload={"url": url, "grade": letter, "expires_at": badge["expires_at"], "detail": f"Valid until {formatted}"})` |
| exception, **only when `task_self.request.retries >= task_self.max_retries`** | `log_event(... "scan_failed", payload={"detail": "scan error"})` then `raise task_self.retry(exc=exc)` |

Notes:
- `scan_started` is logged **after** `consent.verify()` (so `url` is available and the
  event reflects a scan that actually began). Logged once via the `retries == 0` guard
  to avoid duplicate feed spam on retries.
- `scan_completed` and `badge_issued` run only on the success path (once).
- Badge supersede is naturally idempotent (lapses any prior active before inserting).
- `_mark_scan(failed)` continues to run on every failed attempt (unchanged); only the
  `scan_failed` **activity event** is gated to the final failure.

## Web integration

- **`POST /api/urls`** — currently imports only `createServerClient`. Add
  `createServiceClient`; after the successful insert (before the 201 return) call
  `logActivity({ userId: user.id, eventType: 'url_added', urlId: urlRow.id, payload: { url: normalized } })`.
- **`POST /api/verify`** — inside the existing `if (verified)` block (already has
  `serviceClient`) add `logActivity({ userId: user.id, eventType: 'url_verified', urlId: urlRow.id, payload: { url: urlRow.url, method } })`.

Both are best-effort and must not change the existing API responses.

## Payload convention

The activity feed (`apps/web/app/(app)/activity/page.tsx`) renders `payload.url` (string)
and `payload.detail` (string). Every event sets `url` where known; `detail` carries a
short human string. Event types must match the feed's `EVENT_DISPLAY` map:
`scan_started`, `scan_completed`, `scan_failed`, `url_added`, `url_verified`, `badge_issued`.

---

## Testing (TDD)

### Scanner (`pytest`, mock `get_supabase` per existing suite patterns)

- `issue_badge`: inserts an `active` badge with a `public_token` and `expires_at` ≈ now+30d;
  issues an `update` to lapse the prior active badge first.
- `log_event`: inserts the expected row shape; swallows a client error without raising.
- `_execute_scan` success (active): logs `scan_started` + `scan_completed` + `badge_issued`.
- `_execute_scan` success (passive): logs start + completed, **no** badge.
- `_execute_scan` consent failure: logs `scan_failed`, **no** `scan_started`.
- `_execute_scan` retry semantics: `scan_started` only on first attempt; `scan_failed`
  only on final attempt.

### Web

`apps/web` has **no test harness** (no jest/vitest, no `test` script, no test files —
confirmed 2026-06-18). Setting one up is out of scope for this work. Therefore:

- `logActivity` is kept small and defensive (best-effort, swallows errors).
- Web changes verified by `npm run type-check` (clean) + manual end-to-end:
  `url_added` and `url_verified` appear in the `/activity` feed after adding/verifying a URL.

---

## Files touched

```
NEW  apps/scanner/lib/activity.py
NEW  apps/scanner/lib/badges.py
NEW  apps/web/lib/activity.ts
EDIT apps/scanner/jobs/tasks.py
EDIT apps/web/app/api/urls/route.ts
EDIT apps/web/app/api/verify/route.ts
NEW  apps/scanner/tests/…            (badge + activity + tasks tests)
```

No migrations. No new env vars.

## Verification (before claiming done)

- `cd apps/scanner && pytest` — all green (including new tests).
- `cd apps/web && npm run type-check` — clean.
- Manual end-to-end (sandbox): add URL → feed shows `url_added`; verify → `url_verified`;
  run active scan → `scan_started` + `scan_completed` + `badge_issued` appear, `/badge`
  page shows an active badge with 30-day expiry, `/api/badge/[token]` returns `valid:true`.
