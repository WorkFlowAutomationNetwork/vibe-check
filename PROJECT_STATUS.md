# PROJECT_STATUS.md — Vibe-Check

> **Living document.** Update whenever a feature, page, migration, or integration changes. Read at the start of every session. Keep it tight — record current state, not a diary.

---

## What this is

SaaS security auditing for "vibe-coded" apps. User gives a URL, verifies ownership, gets a graded report (headers, TLS, exposed Supabase tables/storage, leaked secrets, rate-limiting, Nuclei). Free = passive; paid = active/deep + badge + monitoring. Target user: indie founders who shipped fast with AI.

**Pricing (live):** Free $0 passive · Starter $9 one-off (active + badge) · Monitor $19/mo (continuous). *Reprice under consideration — see end of doc.*

---

## Current phase

> **Pre-launch.** All app pages built and wired to real Supabase data. Scanner deployed and live. Stripe checkout + subscription lifecycle verified end-to-end. **Blocking launch:** lawyer review of `/terms` + `/privacy`; badge issuance + activity-log writes not yet built (both dashboard features are currently dead); homepage overstates capabilities (see mismatches below).

---

## Infrastructure

| Service | Status | Notes |
|---|---|---|
| Next.js (`apps/web`) | ✅ Live | Next 14 App Router, TS strict. Build clean. |
| Supabase | ✅ Live | Project `lvkiflbpbtmlrgdftivt`. 19 migrations applied. RLS on all tables. |
| Scanner (`apps/scanner`) | ✅ Deployed | `vibe-check-scanner.fly.dev`. FastAPI + Celery + Redis. ~142 tests passing. nuclei v3.9.0 pinned, 13k templates live. VM 2GB/2CPU, scan timeout 300s. |
| Redis | ✅ Deployed | Fly.io managed (`vibe-check-redis`). |
| Stripe | ✅ Wired | Test-mode products (`starter_one_off` $9, `monitor_monthly` $19/mo, by lookup_key). Checkout + portal + webhook all verified end-to-end. **Live keys/products not yet created.** |
| Resend (email) | ❌ Not wired | Key env var exists; no send calls anywhere. |

> **Note:** the 2026-06-17 Fly.io redeploy shipped all scanner work (tech-disclosure, secrets, Supabase/Storage exposure, rate-limit, PDF, Nuclei). The many "⚠️ redeploy required" notes from earlier are **resolved** — everything below is live unless stated otherwise.

---

## Database (key facts)

- 19 migrations applied (`supabase/migrations/`). All tables RLS-enabled; scanner uses service-role key (bypasses RLS).
- `profiles.plan` = `free|starter|monitor`; `is_admin` bool; `stripe_subscription_status` mirrors Stripe. Migration 017 trigger blocks client-side edits to `is_admin`/`plan`/`stripe_*` (privilege-escalation fix).
- `scans.scan_type` — **not** `.type`.
- `plan_limits` (3 rows) + guard fns (`can_run_scan_type`, `can_add_url`) enforce limits at RLS layer; admins bypass. Starter is a **persistent unlock** (passive+active), not a single-use credit.
- `public_findings` view (migration 018) exposes only safe columns to anon — findings table itself is not anon-readable (security review A1/A2).
- `reports` Storage bucket (private), PDFs at `{user_id}/{scan_id}.pdf`, per-user RLS.
- `badge_status` view computes lapse from `expires_at` (no cron needed). `get_landing_stats` RPC powers homepage live counts.

---

## Pages

All `(app)` pages are server components wired to real Supabase data; all `(auth)`/`(marketing)`/`admin` pages built. Highlights and exceptions only:

| Area | Status |
|---|---|
| Marketing: `/`, `/pricing`, `/trust` | ✅ Built. `/terms` + `/privacy` ⚠️ **draft, lawyer review + `[BRACKETED]` placeholders pending**. |
| Auth: sign-in / sign-up / reset / callback | ✅ Built. Sign-up has Terms acceptance gate. |
| App: dashboard, onboard, report, public report, settings, billing, badge, activity | ✅ Wired. |
| `/integrations` | ⚠️ **Mock only.** Entirely hardcoded (acme-app, fake API key, fake hook log). No OAuth, no `/api/integrations`, buttons inert. |
| Admin (dashboard, users, subscriptions, scans, analytics, revenue, settings) | ✅ Built. Revenue page uses placeholder for live Stripe API. |
| `/demo/*` | Frozen static UI for marketing reference. |

**API routes** — all built and auth-guarded: `/api/urls` (POST), `/api/scans` (POST/GET), `/api/verify` (POST), `/api/billing/{checkout,portal,stripe-webhook}`, `/api/webhooks` (deploy hook, API-key auth + dispatch), `/api/badge/[token]` (real verification), `/api/admin/*`. **Missing:** no `DELETE /api/urls/[id]` (see gaps).

---

## Scanner (`apps/scanner/`)

**Built, tested, deployed.** Tiers (`jobs/tasks.py::_scanners_for_tier`):
- **passive** (free): `HeadersScanner` (security headers + tech-stack disclosure), `TLSScanner` (sslyze).
- **active** (paid): + `SupabaseExposureScanner` (table RLS, with common-name fallback), `StorageExposureScanner` (bucket RLS), `SecretsScanner` (leaked creds in JS bundles), `RateLimitScanner` (login-only, ≤17 reqs).
- **deep**: + `NucleiScanner` (curated safe-tag templates; SQLmap/DalFox **not built**).

`grader.py` (A–F), `renderer.py`+`storage.py` (PDF → `reports` bucket on every scan). `consent.verify()` runs before any scanner — non-negotiable.

**Not yet written in scanner:** `badges` row creation and `activity_log` writes on scan completion (both confirmed absent in `jobs/tasks.py`). See gaps.

---

## Stripe

✅ Client, checkout (`/api/billing/checkout` — `mode:payment` for Starter with `customer_creation:'always'`, `mode:subscription` for Monitor), portal, and webhook (`checkout.session.completed` + `customer.subscription.*`, linked via `client_reference_id`) all built and verified end-to-end in test mode (upgrade + downgrade both confirmed against real Stripe API). Remaining: create **live**-mode products and switch keys before launch.

---

## Security findings (this review, 2026-06-17)

| # | Severity | Finding |
|---|---|---|
| S1 | Medium | **SSRF in `/api/verify`.** `checkFile`/`checkMeta` issue server-side `fetch()` to `https://<domain>/…` from the user-supplied URL before ownership is proven. No private-IP/internal-host blocklist (onboard UI *says* "localhost/private IPs not supported" but nothing enforces it). A user could point verification at internal services / cloud metadata hosts. Add an allowlist/denylist (reject RFC1918, link-local `169.254.0.0/16`, loopback, `.internal`) before any fetch. The scanner-side `consent.verify` gate does not cover these web-app fetches. |
| S2 | Low | **Stripe webhook has no event idempotency / dedup.** Replayed or duplicated events re-run the profile update. Harmless today (idempotent updates) but fragile if handlers grow side effects. Consider storing processed `event.id`. |
| S3 | Low | **Verification is single-shot and not re-checked.** Once `urls.verified = true` it stays true forever even if the domain changes hands. Acceptable for now; note for monitoring tier. |
| S4 | Info | Earlier review items **A1–A5, B3, C5, D7** remediated and migrations 018/019 applied. GitGuardian "service-role JWT" alert was a false positive on a test fixture (rebuilt at runtime). |

---

## Gaps / What to build next (priority order)

1. **Badge issuance + activity-log writes (scanner).** `jobs/tasks.py` must create a `badges` row (active scans) and write `activity_log` events on scan start/complete/fail. **Until this ships, the badge page, `/api/badge/[token]`, dashboard badge chips, and the entire activity feed are permanently empty** — these are wired UIs with no data source. High priority: it makes built features actually work.
2. **`DELETE /api/urls/[id]` + dashboard remove button.** Product requirement: a user who hasn't completed a scan should be able to remove a URL (don't lock them out after a typo); hide the option once a scan exists. Not built.
3. **Reconcile homepage/billing copy with reality** (see mismatches below) — before paid launch.
4. **Live Stripe products + keys.**
5. **Integrations OAuth** — GitHub OAuth (CVE/manifest reads), Vercel/Netlify deploy webhooks, Slack alerts. Page is currently a mock.
6. **Resend emails** — welcome, scan-complete, CVE alert.
7. **Lawyer review** of `/terms` + `/privacy`; resolve `[BRACKETED]` placeholders. *(Launch blocker.)*
8. **Operational (from security remediation):** retention purge job + account-deletion cascade verification (C3); sub-processor DPAs (C2).

**Deprioritized indefinitely** (need authenticated/app-specific context a generic scanner can't safely infer): prompt-injection testing, generic IDOR, multi-tenant leakage, auth-bypass. SQLmap/DalFox SQLi/XSS — separate future specs, not started.

---

## Marketing/product mismatches (homepage vs. what's built)

The landing page and billing comparison table advertise features the scanner **does not implement**. Reconcile before launch:

| Claim on site | Reality |
|---|---|
| "Free scan in 60 seconds, **no account, no card**" (hero, CTA, nav) | Every CTA links to `/sign-up`. Scanning requires an account **and** ownership verification. The anonymous free scan does not exist. |
| "180 checks across six categories" / "~180 individual probes" / "Top 25 vulnerability checks" | ~7 scanner modules. The number is invented. |
| **Prompt injection** — "~40 known jailbreaks" (check card) | No prompt-injection scanner exists. Deprioritized indefinitely. |
| **Auth & access control / IDOR** (check card + billing "active probes (auth, prompt injection, IDOR)") | No auth/IDOR scanner. Deprioritized. |
| **Dependency CVEs** — "cross-check your bundle against the live CVE feed (npm, pypi, cargo)" | No dependency/bundle CVE scanner. Nuclei carries some CVE templates but does not do manifest CVE matching. |
| **Badge** "valid 30 days", "stays active automatically", `180/180` | Badge issuance not built (gap #1). No badge is ever created. |
| Pricing "$9 / scan … **1 URL, expires after scan**" | Starter is a persistent unlock (passive+active), not single-use and does not expire. Copy contradicts implementation. |
| Badge snippet `vibe-check.dev/b.js`, integrations `app.vibe-check.dev/hooks/…` | Domains/badge script not real. |

Honest claims that **are** backed: SSL/security headers, exposed endpoints (Supabase table/storage exposure), misconfigurations/secrets (Stripe test keys, CORS, leaked creds), TLS, rate-limiting.

---

## Known code issues

**`cert-expiry` finding missing** — `scanners/tls.py::_process_result()`. sslyze emits a `CryptographyDeprecationWarning` on a malformed trust-store serial; `verified_certificate_chain[0]` then fails inside `except Exception: pass`, so `cert-expiry` is never written. Fix: fall back to `received_certificate_chain`, or suppress the warning before the sslyze call.

---

## Local dev troubleshooting

**DNS "Check now" fails locally despite a correct TXT record.** `checkDns()` uses Node `dns.resolveTxt()`, which resolves via the OS resolver — a local Pi-hole/caching resolver can hold a stale `NXDOMAIN`. Confirm with `nslookup -type=TXT _vibecheck.<domain> 8.8.8.8` vs. your default resolver; flush the local cache and retry. Not an issue in production (Vercel doesn't route through a home resolver).

**Stripe local webhooks:** `stripe listen --forward-to localhost:3000/api/billing/stripe-webhook --api-key <sk_test from apps/web/.env.local>`. The `whsec_` is stable per account+device and already set as `STRIPE_WEBHOOK_SECRET`. **Caution:** the Stripe MCP connector in this env is wired to the **live** account with no test toggle — use direct test-mode API calls, not the MCP tool, for product creation.

---

## Open product decisions

- **Reprice?** Suggested Starter $29–49, Monitor $39–49/mo (current $9/$19 likely undersells; $19/mo Monitor ≈ $228/yr/customer is thin unit economics). A/B the landing price. Not yet acted on.
- **Onboarding rework?** Consider decoupling the free scan from sign-up: sign up → short "how it works" walkthrough → verify → then run the free scan, rather than forcing URL entry + scan during onboarding.

---

## File map (key files)

```
apps/web/
  app/globals.css                  ← design-system CSS vars (source of truth)
  app/(marketing)/page.tsx         ← landing (overstated claims — see mismatches)
  lib/supabase/server.ts           ← createServerClient + createServiceClient
  lib/stripe/client.ts             ← Stripe instance
  lib/stats.ts                     ← getLandingStats (service-role RPC)
  middleware.ts                    ← route protection
  app/api/{urls,scans,verify,billing/*,webhooks,badge/[token],admin/*}/route.ts
apps/scanner/
  jobs/tasks.py                    ← _execute_scan + _scanners_for_tier (badge/activity writes go here)
  scanners/{headers,tls,supabase_exposure,storage_exposure,secrets,rate_limit,nuclei}.py
  lib/{consent,supabase_creds,jwt,storage}.py
  reports/{grader,renderer}.py + templates/report.html
  fly.toml · Dockerfile (nuclei pinned v3.9.0)
supabase/migrations/               ← 19 migrations (applied)
design/                            ← HTML UI references (source of truth for component structure)
docs/superpowers/{specs,plans}/    ← dated specs + plans for scanner work
```
