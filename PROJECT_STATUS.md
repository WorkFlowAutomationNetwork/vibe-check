# PROJECT_STATUS.md — Vibe-Check

> **Living document.** Update this file whenever a major feature is added, a page is built, a migration is applied, or an integration is wired up. Claude reads this at the start of every session to understand current state.

*Last updated: 2026-06-16 — admin dashboard built · admin bypass for plan limits · analytics + revenue pages added*

---

## ⚠️ Known Issues — Check These First

### 1. `cert-expiry` finding missing from scan output
**File:** `apps/scanner/scanners/tls.py` — `_process_result()` method, cert chain lookup block  
**Root cause:** sslyze emits a `CryptographyDeprecationWarning` about a malformed serial number in a trust store root cert. This causes `verified_certificate_chain[0]` access to fail silently inside `except Exception: pass`, so the `cert-expiry` finding is never written.  
**Fix:** Fall back to `received_certificate_chain` when `verified_certificate_chain` is empty/raises, or suppress the deprecation warning before the sslyze call.

### 2. Tech stack disclosure not checked by scanner
**File:** `apps/scanner/scanners/headers.py`  
**Root cause:** No check for `x-powered-by`, `server`, or `x-fah-adapter` headers that expose the tech stack. Confirmed present in chorusproject.io responses (`x-powered-by: Next.js`, `x-fah-adapter: nextjs-14.0.21`).  
**Fix:** Add `_check_tech_disclosure()` method in `headers.py` that flags these headers as `low` severity findings with category `headers`.

---

Pricing structure review:
 reprice:

  ┌─────────┬──────────────┬────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  Tier   │   Current    │   Suggested    │                                                               Reasoning                                                               │
  ├─────────┼──────────────┼────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Free    │ passive scan │ keep           │ Good top-of-funnel, no change                                                                                                         │
  ├─────────┼──────────────┼────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Starter │ $9 one-off   │ $29–49 one-off │ Real security report, real tools — $9 undersells it. $39 is still impulse-buy territory for an indie founder who just shipped.        │
  ├─────────┼──────────────┼────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Monitor │ $19/mo       │ $39–49/mo      │ Continuous monitoring with CVE alerts and webhook re-scans is genuinely valuable. $19 is below what your infra costs to run at scale. │
  └─────────┴──────────────┴────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  The indie founder angle cuts both ways. Yes, they're price-sensitive — but they're also the person who lost sleep shipping something with AI and genuinely doesn't know if it's safe. They'll pay $39 for peace of mind. They might actually distrust $9.

  One other consideration: the current $19/month Monitor plan only generates ~$228/year per customer. At that rate you need a lot of subscribers before it's a real business. $39–49/month puts you at $468–588/year per customer, which changes the unit economics
  significantly.

  Worth testing — you could A/B the landing page at $39 vs $9 and see if conversion rate drops. My bet is it barely moves.

## What is Vibe-Check?

A SaaS security auditing tool for "vibe-coded" apps. Users provide a URL, verify ownership, and get a graded security report covering headers, SSL/TLS, exposed endpoints, prompt injection vulnerabilities, dependency CVEs, and more.

**Target user:** Indie founders and solo builders who shipped fast with AI and want to know if it's actually secure.

**Pricing tiers:**
- **Free** — passive scan (headers, SSL, DNS), no badge
- **Starter** — $9/scan — full active scan + shareable trust badge
- **Monitor** — $19/month — continuous monitoring, multiple URLs, CVE alerts, Vercel/GitHub webhooks

---

## Current Build Phase

> **Phase: Scanner deployed. All app pages wired to real data. End-to-end scan flow ready to test.**

All Next.js pages are built and **wired to real Supabase data** — no hardcoded placeholders remain. The scanner service is deployed to Fly.io at `https://vibe-check-scanner.fly.dev`. The full onboard → verify → scan → report flow is implemented. A `/demo` namespace preserves the original static UI for marketing. Stripe is configured but no products created yet.

---

## Infrastructure Status

| Service | Status | Notes |
|---|---|---|
| Next.js (apps/web) | ✅ Running | Next.js 14, App Router, TypeScript strict. Build passing. |
| Supabase (remote) | ✅ Live | Project ID: `lvkiflbpbtmlrgdftivt`. All 14 migrations applied. |
| Scanner (apps/scanner) | ✅ Deployed | `https://vibe-check-scanner.fly.dev` — health check confirmed live. FastAPI + Celery + Redis. 40 tests. |
| Redis (Fly.io) | ✅ Deployed | Fly.io managed Redis (Upstash). Connected to scanner. `vibe-check-redis` instance. |
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
| `20260616000016_admin_account.sql` | Auto-sets `is_admin=true` for `patrickcampbell@workflowautomationnetwork.com` on signup (BEFORE INSERT trigger on profiles). Also runs UPDATE in case account already exists. | ✅ Applied |
| `20260616000017_protect_profile_sensitive_fields.sql` | `BEFORE UPDATE` trigger on `profiles` blocking client-side changes to `is_admin`, `plan`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_subscription_status` unless `auth.role() = 'service_role'`. Closes a privilege-escalation hole where any signed-in user could PATCH their own profile via the Supabase client and grant themselves admin/paid-plan status. | ✅ Applied |

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
| Dashboard | `/dashboard` | ✅ Wired | Async server component. Real URL cards, real activity log, real quick-stats. Empty states for no URLs / no scans. RescanButton client component for re-scan. |
| Onboard | `/onboard` | ✅ Wired | `OnboardFlow` client component. Full 4-step state machine: URL create → verify (DNS/file/meta) → scan trigger → polling. Calls `/api/urls`, `/api/verify`, `/api/scans`. |
| Report | `/report/[scanId]` | ✅ Wired | Async server component. Fetches real scan + findings. Shows `ScanPollingView` while pending/running. Real `FindingsList` with expand/collapse. |
| Public Report | `/report/[scanId]/public` | ✅ Wired | Async server component. Anon client, `is_public=true` filter. "Not public" message if not found. Limited findings columns (no remediation). |
| Settings | `/settings` | ✅ Wired | `'use client'`. Profile name save, password change, notification toggles — all write to Supabase `profiles` table. |
| Badge | `/badge` | ✅ Wired | Server component fetches active badge. `BadgeClient` client component handles copy state. Empty state if no badge. |
| Billing | `/billing` | ✅ Wired | Async server component. Real plan from `profiles`, real scan/URL counts. Invoice history links to Stripe portal. Upgrade buttons link to `/api/billing/portal`. |
| Integrations | `/integrations` | ⚠️ Partial | UI rendered. No OAuth flows implemented. |
| Activity | `/activity` | ✅ Built | New page. Paginated `activity_log` query. Event type display map. Empty state. Links to scan reports. |

### Demo namespace (frozen static UI for marketing)

| Page | Route | Notes |
|---|---|---|
| Demo Dashboard | `/demo/dashboard` | Frozen copy of original hardcoded dashboard — acme-app.vercel.app, B+ grade, 4 activity items |
| Demo Report | `/demo/report` | Frozen copy of hardcoded report page |

### Admin routes — authenticated + `is_admin = true`

| Page | Route | Status | Notes |
|---|---|---|---|
| Admin Dashboard | `/admin/dashboard` | ✅ Built | Platform stats via `admin_stats` view. Recent scans table. Reads `scan_type` correctly. |
| Admin Users | `/admin/users` | ✅ Built | Paginated user list with search. Uses `/api/admin/users` route. |
| Admin User Detail | `/admin/users/[userId]` | ✅ Built | Edit user profile, plan, admin flag. Send reset email. Confirm email. Delete user. |
| Admin Create User | `/admin/users/new` | ✅ Built | Create user form with email + password. |
| Admin Subscriptions | `/admin/subscriptions` | ✅ Built | Paying accounts overview. |
| Admin Scans | `/admin/scans` | ✅ Built | All scans with type/status filter and pagination. Reads `scan_type` correctly. |
| Admin Analytics | `/admin/analytics` | ✅ Built | Scan volume over time (12-week bar chart), severity breakdown, grade distribution, top finding categories, most scanned URLs. |
| Admin Revenue | `/admin/revenue` | ✅ Built | MRR/ARR/net revenue, plan breakdown, infra cost table, conversion opportunity, Stripe links (placeholder for live Stripe API). |
| Admin Settings | `/admin/settings` | ✅ Built | Scanner env var status, plan limits table, deployment info, scanner IP allowlist. |

---

## Next.js App — API Routes

| Route | Method | Status | Purpose |
|---|---|---|---|
| `/api/auth/callback` | GET | ✅ | Supabase OAuth/email code exchange |
| `/api/urls` | POST | ✅ | Create URL record. Admin accounts bypass plan limits. Otherwise: free/starter→1 URL, monitor→5. Returns `{ id, url, verification_token }`. |
| `/api/scans` | POST | ✅ | Validate + dispatch to scanner at `SCANNER_API_URL`. Returns `{ scan_id }`. |
| `/api/verify` | POST | ✅ | Real DNS TXT / file / meta tag verification. Updates `urls` on success. |
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
| AppShell | `components/shared/AppShell.tsx` | ✅ | `'use client'` — fetches user/isAdmin/plan via browser Supabase client on mount. |
| AdminShell | `components/admin/AdminShell.tsx` | ✅ | Sidebar nav for all /admin routes. |
| ReportActionsBar | `components/report/ReportActionsBar.tsx` | ✅ | `'use client'` — Share, Download PDF, Re-scan buttons. |
| FindingsList | `components/report/FindingsList.tsx` | ✅ | `'use client'` — expand/collapse findings, severity sort, "expand all". |
| ScanPollingView | `components/report/ScanPollingView.tsx` | ✅ | `'use client'` — polls `/api/scans?id=`, redirects on complete. |
| OnboardFlow | `components/onboard/OnboardFlow.tsx` | ✅ | `'use client'` — full 4-step state machine for URL add + verify + scan. |
| BadgeClient | `components/badge/BadgeClient.tsx` | ✅ | `'use client'` — copy state for badge embed codes. Empty state if no badge. |
| RescanButton | `components/dashboard/RescanButton.tsx` | ✅ | `'use client'` — posts to `/api/scans` and redirects to report. |
| ui/ | `components/ui/` | ❌ Empty | Design system components not yet extracted |

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

**Deployed at:** `https://vibe-check-scanner.fly.dev` — health check `{"status":"ok","version":"0.1.0"}` confirmed live.

**Local dev:** Set `SCANNER_API_URL=http://localhost:8000` in `apps/web/.env.local` and run scanner locally.

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
| Integrations buttons non-functional | Low | "Manage access" / "Disconnect" render but do nothing. OAuth flows not built. |
| Billing upgrade buttons link to Stripe portal | Medium | No checkout session route yet. All upgrade/manage links go to `/api/billing/portal` which requires a Stripe customer ID. Need products created in Stripe + checkout session route. |
| Scanner end-to-end | ✅ Confirmed | chorusproject.io passive scan completed successfully. Findings in DB. |
| Stripe products not created | High | Can't take payments until products/prices exist in Stripe dashboard. |
| `NEXT_PUBLIC_APP_URL` missing from .env.example | Low | Used in `badge/page.tsx` and `billing/portal`. Should be `https://yourdomain.com`. |
| Resend not wired | Low | API key env var exists but no emails sent anywhere (welcome, scan complete, CVE alert). |
| Badge issued automatically | Low | Scanner does not create a `badges` row on scan completion. Needs to be added to `jobs/tasks.py`. |
| Activity log not written by scanner | Low | Scanner doesn't write to `activity_log`. Needs to be added to `jobs/tasks.py`. |
| Admin unlimited-scan bypass | ✅ Confirmed secure | `can_run_scan_type()`/`can_add_url()` (migration 014) already bypass for `is_admin = true` at the RLS layer — verified end-to-end by inserting a `deep` scan as the admin account on the `free` plan. Closed a related hole in migration 017: the `profiles` "update own row" RLS policy had no column restriction, so any user could have PATCHed their own `is_admin`/`plan`/`stripe_*` fields directly. Now blocked by a `BEFORE UPDATE` trigger unless `auth.role() = 'service_role'`. |
| No exposed-secrets scanner | Medium | `secrets` category exists in `FindingCategory` but no `scanners/secrets.py` module exists. JS bundles aren't checked for leaked API keys/tokens. |
| No Supabase/PostgREST exposed-data check | High | No check for publicly readable `/rest/v1/*` endpoints on apps without RLS (the CVE-2025-48757 Lovable pattern). High-relevance gap for our Supabase-using target audience. Source: r/ChatGPTCoding post review, 2026-06-16. |
| No SQLi/XSS/rate-limit checks | Medium | SQLmap/DalFox named in CLAUDE.md tool list but `sqli.py`/`xss.py` don't exist. No probe for missing rate limiting on forms/login (10k fake registration / spam vector called out repeatedly in Reddit post). |

---

## What to Build Next (Priority Order)

1. ~~**End-to-end scan test**~~ ✅ **DONE** — chorusproject.io scanned successfully. 4 medium, 2 low, 1 pass. Findings written to DB and rendered in report UI.
2. **Write activity_log + badge in scanner** — Add `activity_log` writes and `badges` row creation to `jobs/tasks.py` in scanner service. Deploy update.
3. **Stripe products** — Create Free/Starter/Monitor products in Stripe dashboard. Add price IDs to env. Build `/api/billing/checkout` session creation route. Wire upgrade buttons.
4. **NEXT_PUBLIC_APP_URL env var** — Add to `.env.example` and set in Vercel env. Required for badge embed codes and Stripe portal return URL.
5. **Integrations OAuth** — GitHub OAuth for CVE scanning, Vercel webhook for deploy-triggered re-scans.
6. **PDF generation** — WeasyPrint renderer in scanner service (`reports/renderer.py`).
7. **Active scanning** — Add Nuclei integration once CLI tools confirmed on Fly.io machine.
8. **Resend emails** — Welcome email on signup, scan complete notification, CVE alert emails.
9. **Supabase/PostgREST exposed-data check** — New `endpoints` category check: probe `/rest/v1/<table>` for common table names without an auth header, flag `critical` if data returned without RLS. Highest-value addition given target audience.
10. **Secrets scanner** — `scanners/secrets.py` wrapping SecretFinder against JS bundles loaded by the page; flag exposed API keys/tokens as `critical`/`high` in the `secrets` category.
11. **Rate-limit probe** — New check (likely under `endpoints` or a new `auth`-adjacent category): send N rapid requests to login/contact/signup forms, flag `medium` if no 429/throttling observed.

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
