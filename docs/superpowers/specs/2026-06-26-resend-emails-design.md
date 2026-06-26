# Resend Email Integration — Design Spec

**Date:** 2026-06-26
**Status:** Approved

---

## Summary

Wire up three transactional emails using Resend: a welcome email sent when a new user confirms their account, a scan-complete notification sent when a scan finishes, and a critical-findings alert (delivered as a variant of the scan-complete email when the scan finds critical issues). All email sending lives in the Next.js app. No new infrastructure — fire-and-forget inline.

---

## Email Types

| Email | Trigger | Subject |
|---|---|---|
| Welcome | New user completes email confirmation / first OAuth login | `Welcome to Vibe-Check` |
| Scan complete | Scan status transitions to `completed` | `Your scan is ready — Grade X` |
| Critical findings | Same trigger, `has_critical = true` | `⚠️ Critical issues found — <url>` |

---

## Architecture

```
Email confirmation click / OAuth login
        │
        ▼
GET /api/auth/callback          ← exchanges code, detects new user, sends welcome
        │
        └─ sendEmail(welcome)   ← fire-and-forget, swallows errors

Scanner completes scan
        │
        ▼
POST /api/notify/scan-complete  ← protected by SCANNER_INTERNAL_KEY
        │
        ├─ createServiceClient().auth.admin.getUserById(user_id)
        └─ sendEmail(scan-complete | critical)
```

The scanner POSTs to the notify endpoint after writing `status='completed'` to Supabase. If `WEB_NOTIFY_URL` is unset on the scanner, the call is skipped (graceful degradation — scan still completes, user just doesn't get an email).

---

## New Files

### `apps/web/lib/email/client.ts`

Resend singleton + `sendEmail()` helper. Errors are caught and logged; the function always resolves. Never throws.

```ts
sendEmail(params: { to: string; subject: string; html: string }): Promise<void>
```

### `apps/web/lib/email/templates/welcome.ts`

```ts
welcomeEmail(email: string): { subject: string; html: string }
```

Plain HTML email. Uses design system colours. CTA links to `https://www.vibe-check-app.com/dashboard`.

### `apps/web/lib/email/templates/scan-complete.ts`

```ts
scanCompleteEmail(params: {
  url: string
  grade: string
  scanId: string
  hasCritical: boolean
}): { subject: string; html: string }
```

Shows grade, URL scanned, link to report. If `hasCritical`, adds a highlighted "Critical issues found" section above the grade.

### `apps/web/app/api/notify/scan-complete/route.ts`

Internal POST endpoint. Auth: `X-Internal-Key` header must match `SCANNER_INTERNAL_KEY`.

Request body (Zod-validated):
```ts
{
  scan_id:     string (uuid)
  user_id:     string (uuid)
  url:         string (url)
  grade:       string (single letter)
  has_critical: boolean
}
```

Looks up user email via `createServiceClient().auth.admin.getUserById(user_id)`. Calls `sendEmail`. Always returns `200 { ok: true }` if auth passes — email failure is not surfaced to the scanner.

---

## Modified Files

### `apps/web/app/api/auth/callback/route.ts`

After successful `exchangeCodeForSession`, check if user is new (created within last 5 minutes — covers both email-confirmation and first OAuth login without re-sending on subsequent OAuth logins). If new, call `sendEmail(welcomeEmail(email))`.

### `apps/scanner/lib/settings.py`

Add: `web_notify_url: str = ""` — full base URL of the Next.js app (e.g. `https://www.vibe-check-app.com`). Empty = skip notifications.

### `apps/scanner/jobs/tasks.py`

After `_mark_scan(status='completed', ...)`, if `settings.web_notify_url` is set, POST to `{web_notify_url}/api/notify/scan-complete` with `{ scan_id, user_id, url, grade, has_critical }` where `has_critical = any(f.severity == 'critical' for f in findings)`. Use `httpx` with a 5-second timeout. Errors are caught and logged; they never fail the scan.

---

## Environment Variables

### apps/web
| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Resend API key (fix typo: was `RSEND_API_KEY` in `.env.local`) |
| `EMAIL_FROM` | `noreply@vibe-check-app.com` |

### apps/scanner
| Variable | Value |
|---|---|
| `WEB_NOTIFY_URL` | `https://www.vibe-check-app.com` |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Resend API down / network error | Caught in `sendEmail`, `console.error` logged, resolves void |
| User has no email (shouldn't happen) | Notify route returns `{ ok: true }` immediately |
| Scanner can't reach notify endpoint | `httpx` error caught, logged, scan still marked complete |
| `WEB_NOTIFY_URL` not set on scanner | Notification skipped entirely |
| Invalid key on notify endpoint | `401` returned; scanner logs and continues |

---

## Tests

### `apps/web/lib/email/client.test.ts`
- Calls Resend with correct params
- Swallows send errors (never throws)

### `apps/web/lib/email/templates/welcome.test.ts`
- Returns subject `'Welcome to Vibe-Check'`
- HTML contains dashboard link and the user's email

### `apps/web/lib/email/templates/scan-complete.test.ts`
- Subject contains grade when `hasCritical = false`
- Subject contains "Critical" when `hasCritical = true`
- HTML contains report URL and scanned URL

### `apps/web/app/api/notify/scan-complete/route.test.ts`
- Valid key + body → 200, sendEmail called
- Invalid key → 401, sendEmail not called
- Malformed body → 422
- Missing email on user → 200, sendEmail not called

### `apps/web/app/api/auth/callback/route.test.ts`
- New user (created < 5 min ago) → welcome email sent
- Returning user (created > 5 min ago) → no welcome email
- Exchange fails → redirect to sign-in, no email

### `apps/scanner/tests/test_notify.py`
- Completed scan with `web_notify_url` set → httpx POST called with correct payload
- Completed scan with `web_notify_url` empty → no POST
- httpx error → scan still marked complete (no raise)

---

## Out of Scope

- React Email components (plain HTML is sufficient)
- Standalone CVE alert emails for monitoring re-scans (future: separate notification spec)
- Email preferences / unsubscribe (future)
- Supabase Edge Functions (over-engineered for this volume)
