# Prelaunch Gate — Design Spec

**Date:** 2026-06-20
**Status:** Approved, ready for implementation plan
**Scope:** `apps/web` only (Next.js). No scanner changes.

## Goal

While the app is in pre-launch testing and development, anyone who reaches the
deployed site sees a "Vibe-Check — Coming Soon / Developer access only" screen
with a password box. Entering the shared password unlocks the whole site for
that browser (via a cookie); the real homepage and app then work normally. The
screen also offers an optional "notify me at launch" email capture.

The gate is a temporary, env-toggled wall — turned off (without a code change)
at launch by flipping one env var.

## Non-goals

- Not a per-user auth system. One shared password for all devs/testers.
- No launch emails are sent yet. Notify signups are only stored.
- No rate-limiting / lockout on the password form (acceptable for a temporary
  dev gate with a high-entropy shared password).

## Configuration

Two env vars (documented in `.env.example`, both root and `apps/web`, and in
CLAUDE.md):

- `PRELAUNCH_LOCK_ENABLED` — `true`/`false`. The on/off switch.
- `PRELAUNCH_PASSWORD` — the shared secret.

**Lock-engaged rule (fail-safe):** the gate is active when
`PRELAUNCH_LOCK_ENABLED === 'true'`. If enabled but `PRELAUNCH_PASSWORD` is
empty/unset, the gate stays locked and the unlock route always rejects (it must
never fall open to "no password = everyone in"). At launch, set
`PRELAUNCH_LOCK_ENABLED=false` in Vercel — no redeploy of code required.

## Architecture

### 1. Middleware gate (the choke point)

A new check runs at the very top of `updateSession` in
`apps/web/lib/supabase/middleware.ts`, *before* any Supabase client creation or
session logic.

```
if lock NOT engaged:
    -> continue to existing updateSession logic unchanged   (today's behaviour)

if request path is exempt (see Exemptions):
    -> continue to existing logic

if request has a valid `vibe_prelaunch` cookie:
    -> continue to existing logic

else:
    -> rewrite to the gate page, HTTP 200, same URL (NextResponse.rewrite)
```

Rewrite (not redirect) keeps the URL stable and nothing behind the gate is
served/crawlable. The gate logic lives in a small helper
(`lib/prelaunch/gate.ts`) so the middleware stays thin and the rules are unit
-testable in isolation.

### 2. Exemptions (always allowed even when locked)

- The gate page route and its assets.
- `POST /api/prelaunch/unlock` and `POST /api/prelaunch/notify`.
- Static assets — already excluded by the existing middleware `matcher`.
- Machine endpoints that must never see a human password wall (they carry
  their own secret/signature auth): `/api/billing/*` (Stripe webhook),
  `/api/webhooks/*`, `/api/scans`, `/api/repo-scans`, and Supabase auth
  callback routes under `/api/auth/*` / `/auth/*`.

Exemptions are a single allowlist array in `lib/prelaunch/gate.ts` so there is
one obvious place to audit what bypasses the wall.

### 3. Unlock flow

- The gate page renders a password `<form>` that POSTs to
  `/api/prelaunch/unlock`.
- The route compares the submitted value to `PRELAUNCH_PASSWORD` using a
  constant-time comparison (`crypto.timingSafeEqual` over equal-length buffers;
  unequal lengths short-circuit to fail). Empty configured password => always
  fail.
- On success: set cookie `vibe_prelaunch` = a signed/HMAC token (HMAC of a
  constant marker keyed by `PRELAUNCH_PASSWORD`, so rotating the password
  invalidates all existing cookies). Cookie flags: `httpOnly`, `secure`,
  `sameSite=lax`, `path=/`, `maxAge` ≈ 30 days. Redirect to `/`.
- On failure: redirect back to the gate with an error indicator (e.g.
  `?error=1`); the page shows "Incorrect password".

The middleware validates the cookie by recomputing the HMAC and comparing in
constant time — it does not just check for cookie presence.

### 4. Notify signup (waitlist capture)

- New migration: table `waitlist`
  - `id uuid pk default gen_random_uuid()`
  - `email text not null unique`
  - `source text not null default 'prelaunch'`
  - `created_at timestamptz not null default now()`
  - RLS enabled; no public policies. Inserts happen via the service-role client
    only (matches the existing urls/scans/findings write pattern).
- `POST /api/prelaunch/notify`: Zod-validates the email, normalises
  (trim + lowercase), upserts on the unique `email` (`onConflict: email`,
  ignore duplicates). Always returns a generic success (`{ ok: true }`) for
  both new and duplicate emails so the endpoint can't be used to enumerate who
  has signed up. Invalid email → 400.

### 5. Gate page UI

A standalone page (no site nav, no links inward) styled with the existing
design-system CSS variables (`--bg`, `--ink`, `--violet`, `--lime`, the
`6px 6px 0 var(--ink)` card shadow, `--font-display`/`--font-mono`). Content:

- "VIBE-CHECK" wordmark
- "Coming soon" + "Developer access only"
- Password field + "Enter" button (posts to unlock; shows error on `?error=1`)
- A divider, then "Get notified when we launch" + email field + button
  (posts to notify; shows a thank-you state on success)

## Files

- Create: `apps/web/lib/prelaunch/gate.ts` — `isLockEngaged()`,
  `isExemptPath(pathname)`, `signToken()/verifyToken()`, exemption allowlist.
- Modify: `apps/web/lib/supabase/middleware.ts` — call the gate at the top of
  `updateSession`.
- Create: `apps/web/app/prelaunch/page.tsx` (+ minimal styling) — the gate UI.
- Create: `apps/web/app/api/prelaunch/unlock/route.ts`.
- Create: `apps/web/app/api/prelaunch/notify/route.ts`.
- Create: `supabase/migrations/<ts>_waitlist.sql`.
- Tests alongside each (`*.test.ts`).

## Testing

- **Gate helper** (`gate.test.ts`): lock engaged vs not (env toggle); exempt
  paths bypass; valid token verifies, tampered/empty token fails; empty
  configured password ⇒ lock stays closed and token never verifies.
- **Middleware**: locked + no cookie ⇒ rewrite to `/prelaunch`; locked + valid
  cookie ⇒ passes to normal logic; lock off ⇒ existing behaviour untouched;
  exempt path while locked ⇒ passes.
- **Unlock route**: correct password sets cookie + redirects; wrong password
  redirects with error and sets no cookie; empty configured password ⇒ reject;
  comparison is length-safe.
- **Notify route**: valid email stored; invalid email ⇒ 400; duplicate email ⇒
  generic success, no error leak.

## Rollout

- Local/dev/Vercel preview: `PRELAUNCH_LOCK_ENABLED=true`.
- Launch: flip to `false` in Vercel env (no code deploy). Cookie auto-expires.
