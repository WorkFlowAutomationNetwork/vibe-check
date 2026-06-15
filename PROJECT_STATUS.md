# PROJECT_STATUS.md — Vibe-Check

> **Living document.** Update this file whenever a major feature is added, a page is built, a migration is applied, or an integration is wired up. Claude reads this at the start of every session to understand current state.

*Last updated: 2026-06-15 — scanner service skeleton built, 40/40 tests passing ✅*

---

## What is Vibe-Check?

A SaaS security auditing tool for "vibe-coded" apps. Users provide a URL, verify ownership, and get a graded security report covering headers, SSL/TLS, exposed endpoints, prompt injection vulnerabilities, dependency CVEs, and more.

**Target user:** Indie founders and solo builders who shipped fast with AI and want to know if it's actually secure.

**Pricing tiers:**
- **Free** — passive scan (headers, SSL, DNS), no badge
- **Starter** — $9/scan — full active scan + shareable trust badge
- **Monitor** — $19/month — continuous monitoring, multiple URLs, CVE alerts, Vercel/GitHub webhooks

---

## Current Build Phase

> **Phase: Front-end complete. Scanner service skeleton built and tested. Ready for Fly.io deploy.**

All Next.js pages are built and wired. The Supabase database is live with 14 migrations applied. The Python scanner service (`apps/scanner/`) is **fully scaffolded and implemented** with passive scan modules running and 40 tests passing. Web app now dispatches scans via HTTP to the scanner (BullMQ removed). Stripe is integrated at the config/client level but no products have been created in the Stripe dashboard.

---

## Infrastructure Status

| Service | Status | Notes |
|---|---|---|
| Next.js (apps/web) | ✅ Running | Next.js 14, App Router, TypeScript strict. Build passing. |
| Supabase (remote) | ✅ Live | Project ID: `lvkiflbpbtmlrgdftivt`. All 14 migrations applied. |
| Scanner (apps/scanner) | ✅ Built | FastAPI + Celery + Redis. 40 tests passing. Passive scan (headers + TLS) implemented. Ready to deploy to Fly.io. |
| Redis | ⚠️ Not deployed | Internal to scanner service on Fly.io. Not needed by web app. Local dev: run `redis-server` or Docker. |
| Stripe | ⚠️ Client configured | `lib/stripe/client.ts` exists. No products created in Stripe dashboard yet. |
| Resend (email) | ⚠️ Key needed | Referenced in `.env.example`. Not wired to any send calls yet. |

---

## Supabase Database

### Remote project
- **Project ID:** `lvkiflbpbtmlrgdftivt`
- **Region:** (Supabase default)
- **All 14 migrations applied** to the remote project

### Migrations applied

| File | Purpose | Status |
|---|---|---|
| `20260519000001_extensions.sql` | pg extensions (uuid-ossp, pgcrypto) | ✅ Applied |
| `20260519000002_profiles.sql` | profiles table, extends auth.users | ✅ Applied |
| `20260519000003_urls.sql` | urls table | ✅ Applied |
| `20260519000004_scans.sql` | scans table | ✅ Applied |
| `20260519000005_findings.sql` | findings table | ✅ Applied |
| `20260519000006_badges.sql` | badges table | ✅ Applied |
| `20260519000007_activity_log.sql` | activity_log table | ✅ Applied |
| `20260519000008_integrations.sql` | integrations table | ✅ Applied |
| `20260519000009_webhook_log.sql` | webhook_log table | ✅ Applied |
| `20260519000010_api_keys.sql` | api_keys table | ✅ Applied |
| `20260519000011_rls_policies.sql` | Row Level Security on all tables | ✅ Applied |
| `20260521000012_admin.sql` | `is_admin` column on profiles, `admin_stats` view, admin RLS bypass | ✅ Applied |
| `20260521000013_set_admin_user.sql` | Sets `is_admin = true` for `patrickcampbell@workflowautomationnetwork.com.au` | ✅ Applied |
| `20260521000014_plan_enforcement.sql` | `plan_limits` table, guard functions (`can_add_url`, `can_run_scan_type`, etc.), `my_entitlements` view | ✅ Applied |
| `20260521000015_indexes_storage_stripe_status.sql` | `stripe_subscription_status` on profiles, 9 missing FK indexes, `reports` Storage bucket + RLS, `badge_status` view | ✅ Applied |

### Key schema facts
- `profiles.plan` = `'free' | 'starter' | 'monitor'`
- `profiles.is_admin` = boolean (used for admin portal access)
- `profiles.stripe_subscription_status` = `'active' | 'trialing' | 'past_due' | 'canceled' | ...` — mirrors Stripe's subscription status
- `scans.scan_type` — **not** `.type`. The column name is `scan_type`.
- RLS enabled on all tables. Scanner service uses service role key (bypasses RLS).
- `plan_limits` table has 3 rows (free/starter/monitor) with per-plan capability columns.
- `my_entitlements` view — shows current user's effective limits.
- `badge_status` view — same as `badges` but adds `effective_status` computed from `expires_at` (auto-lapses without a cron job).
- Public badge endpoint uses anon-accessible view on `badges` filtered by `public_token`.
- Storage bucket `reports` exists (private). PDFs stored at `reports/{user_id}/{scan_id}.pdf`. Users can read their own folder only.

---

## Next.js App — Page Status

### (marketing) routes — unauthenticated

| Page | Route | Status | Notes |
|---|---|---|---|
| Landing | `/` | ✅ Built | Converted from `design/Vibe-Check Landing.html`. Uses `landing.css`. |
| Pricing | `/pricing` | ✅ Built | Full marketing page — 3 tiers, FAQ, footer CTA. Uses `landing.css`. |

### (auth) routes — unauthenticated

| Page | Route | Status | Notes |
|---|---|---|---|
| Sign In | `/sign-in` | ✅ Built | Supabase auth, redirect on success |
| Sign Up | `/sign-up` | ✅ Built | Supabase auth, email confirmation |
| Reset Password | `/reset-password` | ✅ Built | Supabase password reset flow |
| Auth Callback | `/api/auth/callback` | ✅ Built | Exchange code for session |

### (app) routes — authenticated, wrapped in AppShell

| Page | Route | Status | Notes |
|---|---|---|---|
| Dashboard | `/dashboard` | ✅ Built | Server component. No event handlers (removed stub onClick). Admin link is in AppShell sidebar. Hardcoded placeholder scan/URL data. |
| Onboard | `/onboard` | ✅ Built | `'use client'`. 3 verification methods (DNS, file, meta tag). All 4 copy buttons wired with clipboard API + "✓ copied" feedback. URL submission not yet wired to scanner. |
| Report | `/report/[scanId]` | ✅ Built | Server component. `ReportActionsBar` client component handles share/download/re-scan actions. Hardcoded placeholder scan data. |
| Public Report | `/report/[scanId]/public` | ✅ Built | Standalone (no AppShell). Branded header. Grade, findings table, CTA to sign up. Hardcoded placeholder data. |
| Settings | `/settings` | ✅ Built | `'use client'`. Profile name save, password change, notification toggles, scan depth/rate — all write to Supabase `profiles` table. WAF IP copy. Delete account placeholder (shows alert). |
| Badge | `/badge` | ✅ Built | Badge status, HTML/Markdown embed codes, copy buttons, public link, how-it-works cards. Hardcoded placeholder token. Not yet wired to real badges table. |
| Billing | `/billing` | ✅ Built | Shows current plan, invoice history (hardcoded). "Manage payment →" links to `/api/billing/portal` (Stripe Customer Portal route exists). Upgrade/switch-to-annual buttons not yet wired. |
| Integrations | `/integrations` | ⚠️ Partial | UI is fully rendered (GitHub/Vercel/Netlify/Slack cards). "Manage access" and "Disconnect" buttons have no handlers — just rendered. No OAuth flows implemented. |
| Activity | `/activity` | ❌ Missing | Linked from dashboard "full log →". Route does not exist yet — will 404. |

### Admin routes — authenticated + `is_admin = true`

| Page | Route | Status | Notes |
|---|---|---|---|
| Admin Dashboard | `/admin/dashboard` | ✅ Built | Platform stats via `admin_stats` view. Recent scans table. Reads `scan_type` correctly. |
| Admin Users | `/admin/users` | ✅ Built | Paginated user list with search. Uses `/api/admin/users` route. |
| Admin User Detail | `/admin/users/[userId]` | ✅ Built | Edit user profile, plan, admin flag. Send reset email. Confirm email. Delete user. |
| Admin Create User | `/admin/users/new` | ✅ Built | Create user form with email + password. |
| Admin Subscriptions | `/admin/subscriptions` | ✅ Built | Paying accounts overview. |
| Admin Scans | `/admin/scans` | ✅ Built | All scans with type/status filter and pagination. Reads `scan_type` correctly. |
| Admin Settings | `/admin/settings` | ✅ Built | Scanner env var status, plan limits table, deployment info, scanner IP allowlist. |

---

## Next.js App — API Routes

| Route | Method | Status | Purpose |
|---|---|---|---|
| `/api/auth/callback` | GET | ✅ | Supabase OAuth/email code exchange |
| `/api/scans` | POST | ✅ Stub | Validate + enqueue scan. Not yet connected to scanner service. |
| `/api/verify` | POST | ✅ Stub | DNS/file ownership verification check |
| `/api/billing/stripe-webhook` | POST | ✅ | Stripe webhook — updates profiles on subscription events |
| `/api/billing/portal` | GET | ✅ | Stripe Customer Portal redirect (creates session, redirects user) |
| `/api/webhooks` | POST | ✅ Stub | Vercel/Netlify deploy hook receiver |
| `/api/badge/[token]` | GET | ✅ Stub | Public badge verification endpoint |
| `/api/admin/users` | GET, POST | ✅ | List all users, create user (service role) |
| `/api/admin/users/[userId]` | GET, PATCH, DELETE | ✅ | CRUD for individual user |
| `/api/admin/users/[userId]/send-reset` | POST | ✅ | Trigger password reset email |
| `/api/admin/users/[userId]/confirm-email` | POST | ✅ | Force-confirm user's email |

---

## Components

| Component | Location | Status | Notes |
|---|---|---|---|
| AppShell | `components/shared/AppShell.tsx` | ✅ | `'use client'` — fetches user/isAdmin/plan via browser Supabase client on mount. Shows "★ Admin panel" link if `is_admin`. Shows correct plan label (Free/Starter/Monitor) in bottom chip. |
| AdminShell | `components/admin/AdminShell.tsx` | ✅ | Sidebar nav for all /admin routes. Same colour scheme as AppShell (uses `--bg-sub`). |
| ReportActionsBar | `components/report/ReportActionsBar.tsx` | ✅ | `'use client'` — Share (copy public URL), Download PDF, Re-scan buttons for report page. |
| ui/ | `components/ui/` | ❌ Empty | Design system components not yet extracted |
| dashboard/ | `components/dashboard/` | ❌ Empty | Dashboard-specific components not yet extracted |
| report/ | `components/report/` | ⚠️ Partial | `ReportActionsBar.tsx` extracted. Other report components not yet extracted |

---

## Scanner Service (apps/scanner/)

**Status: Built and tested. Awaiting Fly.io deployment.**

| Component | Status | Notes |
|---|---|---|
| FastAPI skeleton + health endpoint | ✅ | `GET /health` → `{status, version}` |
| Auth middleware | ✅ | `X-Internal-Key` header, `hmac.compare_digest` |
| POST /api/scans endpoint | ✅ | Receives from web app, enqueues Celery task |
| Celery + Redis queue | ✅ | `jobs/config.py`, `jobs/worker.py`. 3 retries, exponential backoff |
| `consent.verify()` | ✅ | Runs before every scan. Raises `ConsentError` if URL not verified. |
| `HeadersScanner` | ✅ | Checks CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| `TLSScanner` | ✅ | Cert expiry, TLS version (1.0/1.1 = high, 1.2 pass, 1.3 pass) via sslyze |
| `grader.py` | ✅ | A–F grade from findings. -25/critical, -15/high, -8/medium, -3/low |
| `run_scan` task | ✅ | Orchestrates consent → scanners → findings insert → grade → status update |
| Dockerfile | ✅ | Python 3.12-slim. Ready to build. |
| fly.toml | ✅ | Two processes: web (uvicorn) + worker (celery). Sydney region. 512MB RAM. |
| Tests | ✅ | 40/40 passing |
| Nuclei, SQLmap, DalFox | ❌ | Step 2 — not in scope yet |
| PDF generation | ❌ | Step 2 — `reports/renderer.py` not yet implemented |

**To deploy:** `cd apps/scanner && fly launch --name vibe-check-scanner`, then set secrets and add Redis.

**Constraint:** `consent.verify(url_id)` is called before any scanner runs. Non-negotiable.

---

## Stripe Integration

| Item | Status | Notes |
|---|---|---|
| Stripe client | ✅ | `lib/stripe/client.ts` |
| Webhook handler | ✅ | `/api/billing/stripe-webhook/route.ts` — handles `customer.subscription.*`, `invoice.*` events |
| Customer Portal | ✅ | `/api/billing/portal/route.ts` — redirects to Stripe-hosted portal |
| Checkout / upgrade flow | ❌ | No checkout session creation yet. Upgrade buttons on billing page link nowhere. |
| Products in Stripe dashboard | ❌ | No products/prices created yet. Need `price_xxx` IDs to create checkout sessions. |
| `NEXT_PUBLIC_APP_URL` env var | ⚠️ | Referenced in `portal/route.ts` for return URL. Not in `.env.example` yet. |

---

## Auth

- Supabase Auth with email/password
- Middleware at `apps/web/middleware.ts` — protects `/(app)/*` and `/admin/*` routes
- Admin guard: `app/admin/layout.tsx` checks `is_admin = true` via service client. Non-admins get 403 page.
- Admin user: `patrickcampbell@workflowautomationnetwork.com.au`
- Auth helpers: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server + service role), `lib/supabase/middleware.ts`

---

## Known Issues / Gaps

| Issue | Severity | Notes |
|---|---|---|
| `/activity` route missing | Medium | Dashboard links to it. Will 404. Needs a new page. |
| Integrations buttons non-functional | Low | "Manage access" / "Disconnect" render but do nothing. OAuth flows not built. |
| Billing upgrade/annual buttons non-functional | Low | "↑ Upgrade to Monitor" and "Switch to annual" are dead. Need checkout session route + Stripe products. |
| Badge page uses hardcoded token | Low | `BADGE_TOKEN` constant. Not reading from real `badges` table. |
| Report page uses hardcoded data | Low | Scan data, findings, grade are all static. Needs real data from Supabase. |
| Dashboard uses hardcoded data | Low | URL cards, activity log, scan stats are static. Needs real data. |
| Onboard URL submit not wired | Medium | Form exists, copy buttons work, but submitting a URL doesn't call any API or create a DB record. |
| Scanner not yet deployed | High | Built and tested locally. Needs Fly.io app created + secrets set + deployed before scans run end-to-end. |
| Stripe products not created | High | Can't take payments until products/prices exist in Stripe dashboard. |
| `NEXT_PUBLIC_APP_URL` missing from .env.example | Low | Add this var. |
| Resend not wired | Low | API key env var exists but no emails sent anywhere (welcome, scan complete, CVE alert). |
| `stripe_subscription_status` not written by webhook | Low | Column exists but `stripe-webhook/route.ts` needs updating to write it on subscription events. |

---

## What to Build Next (Priority Order)

1. **Deploy scanner to Fly.io** — `fly launch` in `apps/scanner/`, set secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCANNER_INTERNAL_KEY`), add managed Redis, set `SCANNER_API_URL` in Vercel env. Then scans run end-to-end.
2. **Onboard URL submit** — wire the form to create a `urls` row in Supabase and trigger ownership verification (`/api/verify`)
3. **Wire report page to real data** — replace hardcoded scan/findings with Supabase query by `scanId`
4. **Wire dashboard to real data** — replace placeholder URL cards and activity with real rows
5. **`/activity` page** — linked from dashboard, currently 404s
6. **Stripe products** — create Free/Starter/Monitor products in Stripe dashboard, add price IDs to env, build checkout session route
7. **Integrations OAuth** — GitHub OAuth for CVE scanning, Vercel webhook for deploy-triggered re-scans
8. **Badge real data** — read from `badges` table, create badge on first paid scan completion
9. **PDF generation** — WeasyPrint renderer in scanner service
10. **Active scanning** — add Nuclei integration once CLI tools are installed on the Fly.io machine

---

## File Map (key files to know)

```
apps/web/
  app/globals.css                    ← CSS variables (design system source of truth)
  app/(app)/app.css                  ← App-area component styles
  app/(marketing)/landing.css        ← Marketing page styles
  app/admin/admin.css                ← Admin-specific styles (light sidebar, matches app)
  lib/supabase/server.ts             ← createServerClient() + createServiceClient()
  lib/supabase/client.ts             ← createClient() (browser only)
  lib/stripe/client.ts               ← Stripe instance
  middleware.ts                      ← Route protection
  components/shared/AppShell.tsx     ← Main app sidebar layout
  components/admin/AdminShell.tsx    ← Admin sidebar layout

apps/scanner/
  api/main.py                        ← FastAPI app entry
  api/routes/health.py               ← GET /health (Fly.io health check)
  api/routes/scans.py                ← POST /api/scans (receives from web app)
  api/middleware/auth.py             ← X-Internal-Key header auth (hmac.compare_digest)
  jobs/config.py                     ← Celery app + Redis broker config
  jobs/tasks.py                      ← run_scan Celery task + _execute_scan (testable logic)
  jobs/worker.py                     ← Celery worker entry point
  scanners/base.py                   ← Finding dataclass + BaseScanner ABC
  scanners/headers.py                ← HTTP security header checks (httpx)
  scanners/tls.py                    ← TLS/SSL checks (sslyze)
  lib/consent.py                     ← consent.verify() — MUST run before any scan
  lib/supabase.py                    ← supabase-py service role client singleton
  reports/grader.py                  ← grade(findings) → (letter, score)
  fly.toml                           ← Fly.io config (web + worker processes)
  Dockerfile                         ← Python 3.12-slim image
  tests/                             ← 40 tests, all passing

supabase/
  migrations/                        ← All 14 migrations (applied)
  seed.sql                           ← Dev seed data
  tests/verify_schema.sql            ← Schema validation queries

design/
  Vibe-Check App.html                ← App UI reference (dashboard, report, settings etc.)
  Vibe-Check Landing.html            ← Marketing landing reference
  Vibe-Check Landing (standalone).html ← Standalone marketing reference
```
