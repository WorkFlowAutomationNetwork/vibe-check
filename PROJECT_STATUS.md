# PROJECT_STATUS.md — Vibe-Check

> **Living document.** Update this file whenever a major feature is added, a page is built, a migration is applied, or an integration is wired up. Claude reads this at the start of every session to understand current state.

*Last updated: 2026-06-16 — scan-tier branching + Supabase exposure scanner merged · admin profile RLS hole closed · admin user-detail 500 fixed (illegal RSC event handler) · `scans.type`→`scan_type` bug fixed · sign-out added app-wide · product roadmap re-prioritized after report/scanner critique (Sprint 1: reporting reframe + stack detection; Sprint 2: secrets + storage scanners; IDOR/multi-tenant/prompt-injection deprioritized)*

*2026-06-17 — security review remediation (branch `security-fixes-rls-redirect`): **A1** findings column-leak to anon closed via `public_findings` view + dropped broad anon policy (migration 18, APPLIED to remote); **A2** table-wide anon `badges` policy dropped (migration 18, APPLIED); **A3** auth-callback `next` open-redirect validated to same-origin; **A4** Stripe webhook now links via `client_reference_id` not the non-existent `profiles.email` column (was a dead no-op); **A5** Finding security invariant documented + regression test that row contents never leak into findings; **C5** admin password-reset now actually sends (was `generateLink` no-op → `resetPasswordForEmail`); **B3** `/trust` page shipped with scanner egress IPs; **legal layer** `/terms` + `/privacy` drafted (LAWYER-REVIEW placeholders) + sign-up Terms/Privacy acceptance gate + onboard "I am authorised" acknowledgement (D7). GitGuardian "service-role JWT" alert = FALSE POSITIVE on a test fixture (no real key leaked); fixture rebuilt at runtime so it stops flagging. Migrations 18 + 19 both APPLIED to remote. **Still open (operational, not code):** C3 retention purge job + account-deletion cascade verification; C2 sub-processor DPAs; lawyer review of `/terms` + `/privacy` before paid launch. See `Security-feedback.md` for the per-item status. — Merged to master + pushed.*

*2026-06-17 (later) — **Sprint 1 finished**: tech/stack-disclosure scanner check (`headers.py::_check_tech_disclosure`, +4 tests, resolves Known Issue #2); `Finding` gains optional `metadata`; report "Issues / What's working" split (positive findings); `StackUpgradeBlock` ("Detected stack" + "Active scans available/included") on `/report/[scanId]`; copy reframe on tech-disclosure + missing-CSP findings. Scanner suite 59/59 green; web build clean. ⚠️ **Scanner needs redeploy to Fly.io** for the new header check to run in prod.*

*2026-06-17 (later still) — **Sprint 2 item 6 done: secrets scanner** (`scanners/secrets.py::SecretsScanner`, built via brainstorm→spec→plan→subagent-driven TDD). Scans page + JS bundles for leaked credentials → `critical` each (incl. test-mode keys); publishable keys → `pass` note; masks to last-4 (A5); dedupes; runs on active/deep. Extracted shared `lib/jwt.py`. Scanner suite 84/84 green. Spec: `docs/superpowers/specs/2026-06-17-secrets-scanner-design.md`; plan: `docs/superpowers/plans/2026-06-17-secrets-scanner.md`. ⚠️ **Scanner redeploy to Fly.io** required (covers both the Sprint 1 header check and this).*

*2026-06-17 (latest) — **Sprint 3 item 9 done: rate-limit probe.** `scanners/rate_limit.py::RateLimitScanner` — discovers a login endpoint (first tries a `<form>` with a password input on the page, then falls back to common paths like `/api/auth/login`, `/login`, `/signin`), sends exactly 8 POSTs with bogus credentials, and flags `medium` if none of them show a 429 or `Retry-After` (pass if throttling is observed). Scoped to **login only**, deliberately — probing signup/contact forms with fake data would actually create the spam-account harm this check exists to surface, whereas failed logins have no side effects. Wired into the `active` tier (inherited by `deep`) in `jobs/tasks.py`. Scanner suite 105→**116/116 green** (+11: 8 scanner tests, 3 tier-inclusion tests).*

*2026-06-17 (latest) — **PDF report generation built.** `reports/templates/report.html` (Jinja2) + `reports/renderer.py::render_report_html/render_report_pdf` (WeasyPrint) render a branded PDF (grade card, issues sorted by severity, passing checks) from scan+findings data. `lib/storage.py::upload_report_pdf` uploads it to the existing private `reports` Storage bucket at `{user_id}/{scan_id}.pdf` (RLS already scopes each user to their own folder — migration 015). Wired into `jobs/tasks.py::_execute_scan`: runs after grading, on every completed scan regardless of tier; failure is non-fatal (`pdf_storage_path` just stays `null`) since the security findings are already persisted. Web: `/report/[scanId]` now passes `scan.pdf_storage_path` to `ReportActionsBar`, whose "Download PDF" button calls `supabase.storage.from('reports').createSignedUrl()` from the browser (no new API route needed — existing RLS policy already restricts the signed-URL grant to the owning user) and opens it in a new tab; button is disabled with a tooltip when no PDF exists yet. Dockerfile installs the native Pango/Cairo/GObject libs WeasyPrint needs (absent on a bare Windows dev box — confirmed locally, `weasyprint.HTML(...).write_pdf()` fails without them; `renderer.py` imports it defensively so the module still loads and is testable via mocking `reports.renderer.weasyprint`). Scanner suite 97→**105/105 green** (+8: renderer HTML/PDF, storage upload, two tasks-wiring tests). Also fixed a latent bug from the storage-exposure scanner: it used `category="storage"`, which isn't in the `findings.category` DB check constraint (`headers/transport/ai/auth/cors/deps/endpoints/secrets`) — would have failed every insert in production. Changed to `"endpoints"`, consistent with the table-exposure scanner. ⚠️ **Scanner redeploy to Fly.io required** — stacks on the still-pending redeploys for the header check, secrets scanner, and items 7/8.*

*2026-06-17 (latest) — **Nuclei deep-tier scanner built.** `scanners/nuclei.py::NucleiScanner` wraps the `nuclei` CLI as a subprocess, scoped to a curated safe-tag template subset (`cve`, `exposure`, `misconfig`, `default-login`, `tech` — excludes `dos`/`fuzz`/`intrusive`). Severity mapping: nuclei `critical`→`critical`, `high`→`critical`, `medium`→`medium`, `low`/`info`→`low`; category is always `endpoints`. Wired into the **`deep` tier only** in `jobs/tasks.py::_scanners_for_tier` — the first scanner where `deep` differs from `active`. Built via brainstorm→spec→plan→subagent-driven TDD: 14 new tests in `tests/test_nuclei.py`, all mocking `subprocess.run` (no local nuclei binary required). Spec: `docs/superpowers/specs/2026-06-17-nuclei-deep-tier-scanner-design.md`; plan: `docs/superpowers/plans/2026-06-17-nuclei-deep-tier-scanner.md`. During implementation a reviewer flagged the Dockerfile's `go install nuclei@latest` as an unpinned-version reproducibility risk — a future image rebuild could silently pull a different nuclei version with different CLI flags, which `NucleiScanner` would degrade to a silent "zero findings" result rather than a loud failure. Fixed in a follow-up commit pinning to `v3.9.0`. Scanner suite 116→**133/133 green**. SQLmap/DalFox remain explicitly out of scope — separate future specs. ⚠️ **Scanner redeploy to Fly.io required** (multi-stage Dockerfile change must ship, stacks on top of prior pending redeploys).*

*2026-06-17 (even later) — **Sprint 2 items 7 + 8 done.** **Item 7:** `SupabaseExposureScanner._discover_tables` now falls back to a ~30-name common-table guess list (`users`, `profiles`, `orders`, etc.) when the OpenAPI root spec discloses no `paths` (introspection disabled or stripped by a proxy) — same RLS-exposure check still runs, just without discovery. The "tables found, none exposed" pass message now counts only tables that actually returned 200 (not raw guesses), so an all-404 guess run no longer falsely claims tables were "found". **Item 8:** new `scanners/storage_exposure.py::StorageExposureScanner` — lists Supabase Storage buckets via the same page-derived anon key (`GET /storage/v1/bucket`), then for every bucket **not** marked `public`, attempts `POST /storage/v1/object/list/{bucket}`; a non-empty result means storage.objects RLS is missing/too permissive → `critical` (file names never stored, only counts, per the A5 invariant). Empty listings are treated as ambiguous (Supabase storage RLS silently filters rather than denying) and not flagged. Buckets explicitly marked public are skipped entirely (expected). Shared anon-key/URL extraction logic moved out of `supabase_exposure.py` into `lib/supabase_creds.py` so both scanners use it. Wired into `jobs/tasks.py::_scanners_for_tier` on `active`/`deep`. Scanner suite 84→**97/97 green** (+13 tests: 2 for item 7 fallback, 8 for the new storage scanner, 3 for tier-inclusion). ⚠️ **Scanner redeploy to Fly.io required** (stacks on top of the still-pending header-check + secrets-scanner redeploy).*

---

## ⚠️ Known Issues — Check These First

### 1. `cert-expiry` finding missing from scan output
**File:** `apps/scanner/scanners/tls.py` — `_process_result()` method, cert chain lookup block  
**Root cause:** sslyze emits a `CryptographyDeprecationWarning` about a malformed serial number in a trust store root cert. This causes `verified_certificate_chain[0]` access to fail silently inside `except Exception: pass`, so the `cert-expiry` finding is never written.  
**Fix:** Fall back to `received_certificate_chain` when `verified_certificate_chain` is empty/raises, or suppress the deprecation warning before the sslyze call.

### 2. Tech stack disclosure not checked by scanner — ✅ RESOLVED (2026-06-17)
**File:** `apps/scanner/scanners/headers.py`  
`_check_tech_disclosure()` added: checks `x-powered-by`, `server`, `x-fah-adapter`, `x-aspnet-version`, `x-generator`; emits a `low` finding (or a `pass` when clean) and captures detected technologies in `Finding.metadata.detected` — the data source for the report's "Detected stack" block. ⚠️ **Scanner needs redeploy to Fly.io for this to take effect in production.**

---

## 🧰 Local Dev Troubleshooting Notes

Environment quirks that look like app bugs but aren't — check here before debugging code.

### DNS ownership verification ("Check now") fails locally even with a correct TXT record
**Symptom:** `/api/verify` with `method: 'dns'` returns `verified: false` even though the TXT record (`_vibecheck.<domain>` = `vc-verify=<token>`) is set correctly.
**Root cause:** `checkDns()` (`app/api/verify/route.ts`) uses Node's `dns.resolveTxt()`, which resolves through whatever DNS server your local machine/OS is configured to use — not a fixed public resolver. If that's a local Pi-hole or other caching resolver, it can hold a stale `NXDOMAIN` from before the record propagated and never re-check.
**How to confirm:** query the record directly against a known-good public resolver and compare to your default resolver, e.g.:
```
nslookup -type=TXT _vibecheck.<domain> 8.8.8.8     # Google — should show the record
nslookup -type=TXT _vibecheck.<domain>             # your default resolver — may show NXDOMAIN
```
If the public resolver sees it but your default one doesn't, it's a local caching issue, not a code or DNS-config bug.
**Fix:** flush the local resolver's cache (e.g. Pi-hole: Tools → Flush Network Table, or `pihole restartdns reload` on the Pi-hole host) and retry. Not an issue in production — Vercel doesn't route through a home resolver.

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
| Supabase (remote) | ✅ Live | Project ID: `lvkiflbpbtmlrgdftivt`. All 19 migrations applied. |
| Scanner (apps/scanner) | ✅ Deployed | `https://vibe-check-scanner.fly.dev` — health check confirmed live. FastAPI + Celery + Redis. 84 tests. |
| Redis (Fly.io) | ✅ Deployed | Fly.io managed Redis (Upstash). Connected to scanner. `vibe-check-redis` instance. |
| Stripe | ⚠️ Client configured | `lib/stripe/client.ts` exists. No products created in Stripe dashboard yet. |
| Resend (email) | ⚠️ Key needed | Referenced in `.env.example`. Not wired to any send calls yet. |

---

## Supabase Database

### Remote project
- **Project ID:** `lvkiflbpbtmlrgdftivt`
- **Region:** (Supabase default)
- **All 19 migrations applied** to the remote project

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
| `20260617000018_public_findings_view_and_badge_policy.sql` | Security review A1+A2: creates `public_findings` view (only `id,scan_id,severity,title,category,result`), drops broad `anon can view public scan findings` policy on `findings`, grants SELECT-only on the view to anon/authenticated, drops table-wide `anon can view active badges` policy. | ✅ Applied |
| `20260617000019_terms_acceptance.sql` | D7: adds `terms_accepted_at` + `terms_version` to `profiles`; extends `handle_new_user()` to copy them from auth metadata on signup. | ✅ Applied |

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
| Landing | `/` | ✅ Built | Converted from `design/Vibe-Check Landing.html`. Uses `landing.css`. Footer links wired to /trust, /terms, /privacy, /pricing. |
| Pricing | `/pricing` | ✅ Built | Full marketing page — 3 tiers, FAQ, footer CTA. Uses `landing.css`. |
| Trust | `/trust` | ✅ Built | Scanner egress IPs (keep in sync with /admin/settings) + scanning safeguards. B3. |
| Terms | `/terms` | ✅ Draft | All D1–D6 clauses. **Lawyer review + `[BRACKETED]` placeholders pending.** Uses `LegalShell`. |
| Privacy | `/privacy` | ✅ Draft | C1 privacy policy + C3 retention + C4 PCI. **Lawyer review pending.** Uses `LegalShell`. |

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
| Admin User Detail | `/admin/users/[userId]` | ✅ Built | Edit user profile, plan, admin flag. Send reset email. Confirm email. Delete user. Fixed 2026-06-16: page crashed with a 500 because an `onClick`/`confirm()` handler was passed directly to a `<button>` in this Server Component (RSC can't serialize event handlers) — extracted into `components/admin/DeleteAccountForm.tsx` (client component). Also fixed: "Recent Scans" table queried `scans.type` (column doesn't exist, real name is `scan_type`) so it silently always rendered empty — corrected to `scan_type`. |
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
| ReportActionsBar | `components/report/ReportActionsBar.tsx` | ✅ | `'use client'` — Share, Download PDF, Re-scan buttons. Download PDF creates a signed Storage URL client-side from `scan.pdf_storage_path`; disabled with a tooltip if no PDF exists yet. |
| FindingsList | `components/report/FindingsList.tsx` | ✅ | `'use client'` — splits into "Issues (n)" + "What's working (n)"; expand/collapse, severity sort, "expand all". |
| StackUpgradeBlock | `components/report/StackUpgradeBlock.tsx` | ✅ | Server component — "Detected stack" (from `metadata.detected`) + "Active scans available/included" (static catalogue). Upgrade CTA on passive/free scans. |
| ScanPollingView | `components/report/ScanPollingView.tsx` | ✅ | `'use client'` — polls `/api/scans?id=`, redirects on complete. |
| OnboardFlow | `components/onboard/OnboardFlow.tsx` | ✅ | `'use client'` — full 4-step state machine for URL add + verify + scan. |
| BadgeClient | `components/badge/BadgeClient.tsx` | ✅ | `'use client'` — copy state for badge embed codes. Empty state if no badge. |
| RescanButton | `components/dashboard/RescanButton.tsx` | ✅ | `'use client'` — posts to `/api/scans` and redirects to report. |
| SignOutButton | `components/shared/SignOutButton.tsx` | ✅ | `'use client'` — calls `supabase.auth.signOut()` (default `global` scope, revokes refresh token server-side) then redirects to `/sign-in`. Added 2026-06-16 to both `AppShell` and `AdminShell` — previously there was no sign-out anywhere in the app. |
| DeleteAccountForm | `components/admin/DeleteAccountForm.tsx` | ✅ | `'use client'` — wraps the admin "Delete account" form with a `confirm()` prompt on submit. Extracted from `admin/users/[userId]/page.tsx` because the original inline `onClick` handler was illegal in that Server Component and caused a 500. |
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
| `HeadersScanner` | ✅ | Checks CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy + **tech-stack disclosure** (`_check_tech_disclosure`: x-powered-by/server/x-fah-adapter/…, detected stack in `metadata`) |
| `TLSScanner` | ✅ | Cert expiry, TLS version (1.0/1.1 = high, 1.2 pass, 1.3 pass) via sslyze |
| `SupabaseExposureScanner` | ✅ | Detects Supabase tables readable via the site's own public anon key (missing RLS) — the CVE-2025-48757 pattern. Falls back to a common-table-name guess list when OpenAPI introspection discloses no `paths`. Runs on `active`/`deep` tiers only. |
| `StorageExposureScanner` | ✅ | Detects Supabase Storage buckets (not marked public) whose contents are listable via the site's own public anon key — missing/too-permissive RLS on `storage.objects`. File names never stored (counts only, A5). `active`/`deep` tiers. Shares `lib/supabase_creds.py` with the table-exposure scanner. |
| `SecretsScanner` | ✅ | Scans page + same-origin JS bundles for leaked credentials (Stripe sk_/rk_, OpenAI, Anthropic, AWS AKIA, GitHub, Slack, SendGrid, npm, private keys, Supabase service-role JWT) → `critical` each (incl. test-mode keys). Publishable keys (Stripe pk_, Supabase anon, Google/Firebase AIza) → `pass` "expected" note. Masks to last-4 only (full secret never stored, A5). Dedupes by content fingerprint. `active`/`deep` tiers. Shares `lib/jwt.py` with the exposure scanner. |
| `RateLimitScanner` | ✅ | Sends 8 bogus-credential POSTs to a discovered login endpoint (form-derived or common-path fallback); flags `medium` if none are throttled (no 429/Retry-After). Login-only by design (signup probing would itself create spam accounts). `active`/`deep` tiers. |
| Scan-tier branching | ✅ | `jobs/tasks.py::_scanners_for_tier()` — `passive` = headers+TLS, `active` = passive + Supabase table exposure + Storage bucket exposure + secrets + rate-limit probe, `deep` = `active` + `NucleiScanner` (first tier where `deep` differs from `active`). |
| `grader.py` | ✅ | A–F grade from findings. -25/critical, -15/high, -8/medium, -3/low |
| `run_scan` task | ✅ | Orchestrates consent → scanners → findings insert → grade → status update |
| Dockerfile | ✅ | Python 3.12-slim. Ready to build. |
| fly.toml | ✅ | Two processes: web (uvicorn) + worker (celery). Sydney region. 512MB RAM. |
| Tests | ✅ | 133/133 passing |
| `NucleiScanner` | ✅ | Curated safe-tag template subset (cve/exposure/misconfig/default-login/tech, excludes dos/fuzz/intrusive). `deep` tier only. SQLmap/DalFox still not started — separate future specs. |
| PDF generation | ✅ | `reports/renderer.py` (Jinja2 + WeasyPrint) + `lib/storage.py` upload to `reports` bucket. Runs on every completed scan in `jobs/tasks.py`. Web "Download PDF" button wired via signed URL. ⚠️ needs Fly.io redeploy (Dockerfile updated with native Pango/Cairo libs). |

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
- Sign out: `components/shared/SignOutButton.tsx`, wired into both `AppShell` (user sidebar) and `AdminShell` (admin sidebar). Calls `supabase.auth.signOut()` with the default `global` scope, which revokes the refresh token server-side — the user must log in again on next visit, not just locally cleared.

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
| No exposed-secrets scanner | ✅ Resolved 2026-06-17 | `scanners/secrets.py` (`SecretsScanner`) scans JS bundles for leaked credentials, runs on active/deep. Sprint 2 item 6. ⚠️ scanner redeploy required for prod. |
| Supabase/PostgREST exposed-data check | ✅ Built + extended 2026-06-17 | `scanners/supabase_exposure.py` — runs on `active`/`deep` scan tiers. `scan_type` previously did nothing; now `jobs/tasks.py` branches scanner selection by tier via `_scanners_for_tier()`. Sprint 2 item 7: now falls back to common-table-name guessing when OpenAPI introspection is disabled. |
| No Storage bucket exposure check | ✅ Resolved 2026-06-17 | `scanners/storage_exposure.py` (`StorageExposureScanner`) — Sprint 2 item 8. Checks non-public buckets for anon-key-listable contents (missing storage.objects RLS). ⚠️ scanner redeploy required for prod. |
| No SQLi/XSS checks | Medium | SQLmap/DalFox named in CLAUDE.md tool list but `sqli.py`/`xss.py` don't exist — separate future specs. |
| No rate-limit probe | ✅ Resolved 2026-06-17 | `scanners/rate_limit.py` (`RateLimitScanner`) — Sprint 3 item 9. Login-endpoint only. ⚠️ scanner redeploy required for prod. |

---

## What to Build Next (Priority Order)

> **2026-06-16 product review** — full critique exchanged and converged (see git history of this file for the discarded "run all scanners free, gate visibility" idea — rejected: breaks the free/paid compute boundary and increases legal/consent exposure for zero revenue). Decisions below supersede any earlier draft of this list. Key calls:
> - Free tier stays **passive-only** for execution, but must *feel* valuable — positive findings + named "Active Scans Available" categories, not a crippled teaser.
> - Findings copy should be reframed around the actual vibe-coder stack (Supabase RLS, Next.js/Vercel disclosure) instead of generic OWASP language.
> - Generic IDOR / multi-tenant-leakage / auth-bypass scanners are **deprioritized indefinitely** — these require authenticated test credentials per target app, which is a different product (pentest-style), not a generic scanner. Revisit only if/when there's a plan for users to safely hand over test credentials.
> - Rate-limit probing must stay lightweight (5-10 requests, not "unlimited") and paid-tier only — anything more risks being read as abusive traffic against a third party's production site.

### Sprint 1 — Reporting & free-tier value — ✅ DONE (2026-06-17, except noted)
1. ✅ **Reporting reframe** — Critical/Medium/pass buckets + grade card with verdict. *(landed in d010aab)*
2. ✅ **Positive findings section** — `FindingsList` now splits into "Issues (n)" and "What's working (n)"; passing checks framed as positives.
3. ✅ **Tech/stack disclosure check** — `_check_tech_disclosure()` in `headers.py` (+4 tests). Resolves Known Issue #2. ⚠️ scanner redeploy required.
4. ✅ **"Detected Stack" + "Active Scans Available" block** — `components/report/StackUpgradeBlock.tsx`, rendered on `/report/[scanId]`. Reads `metadata.detected`; shows upgrade CTA on passive/free scans, "included" on active/deep.
5. 🟡 **Copy pass** — New surfaces (tech-disclosure finding, StackUpgradeBlock) + the missing-CSP finding reframed in Supabase/Next.js/Vercel terms. Remaining generic header/TLS finding copy not yet reframed — small follow-up.

### Sprint 2 — New scanners (paid tiers) — ✅ DONE (2026-06-17)
6. ✅ **Secrets scanner** — `scanners/secrets.py`, scans JS bundles loaded by the page for OpenAI/Stripe/AWS/Supabase-service-key/Firebase credential patterns. Flag `critical`/`high` in the `secrets` category. Highest-value new scanner — pair with Supabase exposure as the flagship "we find what vibe-coding tools leak" pitch.
7. ✅ **Supabase/PostgREST exposed-data check refinement** — `supabase_exposure.py` now falls back to a common-table-name guess list when OpenAPI `paths` discovery is empty.
8. ✅ **Public storage exposure (Supabase Storage only for now)** — `scanners/storage_exposure.py`, extends the Supabase-exposure auth pattern to check non-public bucket listing via the anon key. Generic S3/R2/Firebase bucket discovery deliberately out of scope (different problem — bucket-name guessing).

### Sprint 3 — Operational depth
9. ✅ **Rate-limit probe** — `scanners/rate_limit.py`. 8 requests against a discovered login endpoint only (not signup/contact — see note above), flags `medium` if no throttling observed. `active`/`deep` tiers.
9b. ✅ **Nuclei deep-tier scanner** — `scanners/nuclei.py::NucleiScanner`, curated safe-tag template subset, `deep` tier only. Spec: `docs/superpowers/specs/2026-06-17-nuclei-deep-tier-scanner-design.md`; plan: `docs/superpowers/plans/2026-06-17-nuclei-deep-tier-scanner.md`. SQLmap/DalFox (Sprint 3's "Nuclei / SQLi / XSS" line) remain **not started** — separate future specs, out of scope for this work.
10. **Integrations OAuth** — GitHub OAuth for CVE scanning, Vercel webhook for deploy-triggered re-scans.
11. **CVE monitoring** — ties into Monitor tier's "continuous protection" pitch.

### Deprioritized / not planned
- Generic IDOR detection, multi-tenant data leakage testing, generic auth-bypass testing, prompt-injection testing — all require authenticated workflows or app-specific context a generic scanner can't safely infer. Revisit if the product grows a pentest-style authenticated-testing tier.

### Other outstanding items (unrelated to the above review, still pending)
- **Write activity_log + badge in scanner** — Add `activity_log` writes and `badges` row creation to `jobs/tasks.py` in scanner service. Deploy update.
- **Stripe products** — Create Free/Starter/Monitor products in Stripe dashboard. Add price IDs to env. Build `/api/billing/checkout` session creation route. Wire upgrade buttons.
- **NEXT_PUBLIC_APP_URL env var** — Add to `.env.example` and set in Vercel env. Required for badge embed codes and Stripe portal return URL.
- ~~**PDF generation**~~ ✅ **DONE** — `reports/renderer.py` + `lib/storage.py`, wired into `jobs/tasks.py` and the report page's Download PDF button. Needs Fly.io redeploy.
- ~~**Active scanning (Nuclei)**~~ ✅ **DONE** — `scanners/nuclei.py::NucleiScanner`, `deep` tier only. See Sprint 3 item 9b.
- **Resend emails** — Welcome email on signup, scan complete notification, CVE alert emails.
- ~~**End-to-end scan test**~~ ✅ **DONE** — chorusproject.io scanned successfully. 4 medium, 2 low, 1 pass. Findings written to DB and rendered in report UI.

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
  scanners/supabase_exposure.py      ← Supabase table RLS exposure check (+ table-name guess fallback)
  scanners/storage_exposure.py       ← Supabase Storage bucket RLS exposure check
  scanners/secrets.py                ← Leaked credential scanner (JS bundles)
  scanners/rate_limit.py             ← Login-endpoint rate-limit probe (8 bogus-credential POSTs)
  scanners/nuclei.py                 ← Curated-safe-tag Nuclei subprocess wrapper (deep tier only)
  lib/supabase_creds.py              ← Shared Supabase URL/anon-key extraction (used by both exposure scanners)
  lib/jwt.py                         ← Shared JWT decode (role claim only, no signature verification)
  lib/consent.py                     ← consent.verify() — MUST run before any scan
  lib/supabase.py                    ← supabase-py service role client singleton
  lib/storage.py                     ← upload_report_pdf() — pushes rendered PDF to the `reports` Storage bucket
  reports/grader.py                  ← grade(findings) → (letter, score)
  reports/renderer.py                ← render_report_html()/render_report_pdf() — Jinja2 + WeasyPrint
  reports/templates/report.html      ← Jinja2 PDF report template
  fly.toml                           ← Fly.io config (web + worker processes)
  Dockerfile                         ← Python 3.12-slim image
  tests/                             ← 84 tests, all passing

supabase/
  migrations/                        ← All 19 migrations (applied)
  seed.sql                           ← Dev seed data
  tests/verify_schema.sql            ← Schema validation queries

design/
  Vibe-Check App.html                ← App UI reference (dashboard, report, settings etc.)
  Vibe-Check Landing.html            ← Marketing landing reference
  Vibe-Check Landing (standalone).html ← Standalone marketing reference
```
## extra note:
When adding a url, if the user hasn't successfully ran a check they should be able to remove the url and add another so that if they make a mistake they aren't blocked out. If they have run a scan then they shoudn't have the option to remove the url. 
starting to think running the free scan shoudn't be part of the onbaording process, they should sign up with their details, maybe run them through a clean step by step of how it works but not require them to enter it all, once they are signed in and verified then they should be able to run the free scan. 

When finished need to reveiw the home page to ensure the information is still accurate