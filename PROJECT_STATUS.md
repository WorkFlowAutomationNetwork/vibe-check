# PROJECT_STATUS.md — Vibe-Check

> **Living document.** Update whenever a feature, page, migration, or integration changes. Read at the start of every session. Keep it tight — record current state, not a diary.

---

## What this is

SaaS security auditing for "vibe-coded" apps. User gives a URL, verifies ownership, gets a graded report (headers, TLS, exposed Supabase tables/storage, leaked secrets, rate-limiting, Nuclei). Free = passive; paid = active/deep + badge + monitoring. Target user: indie founders who shipped fast with AI.

**Pricing (live):** Free $0 passive · Starter $9 one-off (active + badge) · Monitor $19/mo (continuous). *Reprice under consideration — see end of doc.*

---

## Current phase

> **Pre-launch.** All app pages built and wired to real Supabase data. Scanner deployed and live. Stripe checkout + subscription lifecycle verified end-to-end. Badge issuance + activity-log writes are **live in production** (scanner issues 30-day badges on active/deep completion; scanner + web write the activity feed — Fly.io redeploy shipped 2026-06-18). **Blocking launch:** lawyer review of `/terms` + `/privacy`; homepage overstates capabilities (see mismatches below).

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
| `/integrations` | ⚠️ **Mock only.** Entirely hardcoded (acme-app, fake API key, fake hook log). No OAuth, no `/api/integrations`, buttons inert. **Scope: GitHub + Vercel/Netlify only — Slack dropped (too niche).** |
| Admin (dashboard, users, subscriptions, scans, analytics, revenue, settings) | ✅ Built. Revenue page uses placeholder for live Stripe API. |
| `/demo/*` | Frozen static UI for marketing reference. |

**API routes** — all built and auth-guarded: `/api/urls` (POST), `/api/urls/[id]` (DELETE — a user can remove a URL that has no scans yet; returns 409 `url_has_scans` once a scan exists), `/api/scans` (POST/GET), `/api/verify` (POST), `/api/billing/{checkout,portal,stripe-webhook}`, `/api/webhooks` (deploy hook, API-key auth + dispatch), `/api/badge/[token]` (real verification), `/api/admin/*`.

---

## Scanner (`apps/scanner/`)

**Built, tested, deployed.** Tiers (`jobs/tasks.py::_scanners_for_tier`):
- **passive** (free): `HeadersScanner` (security headers + tech-stack disclosure), `TLSScanner` (sslyze).
- **active** (paid): + `SupabaseExposureScanner` (table RLS, with common-name fallback), `StorageExposureScanner` (bucket RLS), `SecretsScanner` (leaked creds in JS bundles), `RateLimitScanner` (login-only, ≤17 reqs).
- **deep**: + `NucleiScanner` (curated safe-tag templates; SQLmap/DalFox **not built**).

`grader.py` (A–F), `renderer.py`+`storage.py` (PDF → `reports` bucket on every scan). `consent.verify()` runs before any scanner — non-negotiable.

**Badge + activity writes (built 2026-06-18, live in prod):** `jobs/tasks.py` writes `activity_log` events (`scan_started`/`scan_completed`/`scan_failed`) and, on `active`/`deep` completion, issues a 30-day `badges` row via `lib/badges.py::issue_badge` (lapses the prior active badge first) + a `badge_issued` event. Helpers: `lib/activity.py::log_event`, `lib/badges.py::issue_badge`. Web side writes `url_added`/`url_verified` via `apps/web/lib/activity.ts`. Fly.io redeploy shipped 2026-06-18.

---

## Stripe

✅ Client, checkout (`/api/billing/checkout` — `mode:payment` for Starter with `customer_creation:'always'`, `mode:subscription` for Monitor), portal, and webhook (`checkout.session.completed` + `customer.subscription.*`, linked via `client_reference_id`) all built and verified end-to-end in test mode (upgrade + downgrade both confirmed against real Stripe API). Remaining: create **live**-mode products and switch keys before launch.

---

## Security findings (this review, 2026-06-17)

| # | Severity | Finding |
|---|---|---|
| S1 | Medium | **[FIXED 2026-06-19]** **SSRF in `/api/verify`.** `checkFile`/`checkMeta` issued server-side `fetch()` to `https://<domain>/…` from the user-supplied URL before ownership was proven, with no private-IP/internal-host blocklist. Remediated: private-IP/host blocklist now enforced via `apps/web/lib/security/ssrf.ts` — `safeFetch` uses an undici validating dispatcher that rejects RFC1918/loopback/link-local (incl. `169.254.0.0/16`, IPv4-mapped) and `localhost`/`.local`/`.internal`/metadata hosts on every connection and redirect hop (closes DNS-rebinding/TOCTOU), applied at both `/api/verify` and `/api/urls` POST (add-time 422). 49 web tests incl. full IP-blocklist coverage. |
| S2 | Low | **Stripe webhook has no event idempotency / dedup.** Replayed or duplicated events re-run the profile update. Harmless today (idempotent updates) but fragile if handlers grow side effects. Consider storing processed `event.id`. |
| S3 | Low | **Verification is single-shot and not re-checked.** Once `urls.verified = true` it stays true forever even if the domain changes hands. Acceptable for now; note for monitoring tier. |
| S4 | Info | Earlier review items **A1–A5, B3, C5, D7** remediated and migrations 018/019 applied. GitGuardian "service-role JWT" alert was a false positive on a test fixture (rebuilt at runtime). |

---

## Gaps / What to build next (priority order)

> **Launch sequencing (set 2026-06-20).** Product correctness first, commerce last. Order:
> ① scan correctness ② integrations (GitHub + Vercel) ③ email notifications ④ Stripe
> billing/portal reflection ⑤ pricing decisions ⑥ website accuracy + docs/FAQs
> ⑦ detailed testing ⑧ Stripe live payment processing. **Slack integration dropped (too niche).**

1. **Scan correctness — verify the product actually works end-to-end.** ✅ **Validated
   2026-06-20** against 3 real owned domains (bathroomhealthos.com, chorusproject.io,
   merlin.systems) — passive + deep on all. Status transitions, findings, grading, PDF
   storage, badge issuance (active/30-day), and activity feed all confirmed correct. Two
   scan-correctness bugs found + fixed in the process (see *Resolved* below): the
   `cert-expiry` silent miss, and Nuclei's silent timeout (deep scans on slow sites
   dropped the whole Nuclei dimension with no warning). **Both fixes deployed to Fly.io
   and re-validated live** — merlin deep re-scan now finishes in 316s with 4 Nuclei
   findings (was 0) and the duplicate header rows collapsed to one. Merged to master
   (`85838ff`). Passive validated on all 3; **active/deep validated on all 3** (deep
   issues badges correctly). **Customer-facing report verified 2026-06-20:** downloaded
   merlin's deep-scan PDF from Storage and confirmed it renders all severities + grade +
   every finding field correctly (cert-expiry and Nuclei-dedup fixes both visible in the
   PDF). Two loose ends closed (see *Resolved* below): the `urls.verified` data anomaly,
   and a duplicate "No Supabase backend detected" row. **Step ① complete.**
2. **Integrations — in progress.** Scope decided 2026-06-20: GitHub = **committed-secret
   scanning** (clone + gitleaks, full-history baseline then incremental), surfaced as a
   **standalone repo report** (not CVE matching — that's a separate later project; deploy-
   trigger overlaps Vercel). Spec + 3-plan split in `docs/superpowers/`.
   - **Plan A (foundations) — ✅ shipped 2026-06-20** (merged `b95fc32`): 4 RLS tables
     (`github_installations`, `repos`, `repo_scans`, `repo_findings`, live), GitHub App
     connect/callback/webhook/disconnect routes + `lib/github/app.ts`, and an **honest
     `/integrations` page** — real GitHub state, accurate data-handling copy, fabricated
     Vercel/API-key/deploy-log mock data removed (Vercel now "coming soon"). 67 web tests
     pass; production build clean. **Not live** until `vibe-check-app.com` is pointed at the
     deployed app and the six `GITHUB_*` env vars are set (GitHub App `vibe-check-app`
     created; user wiring domain→Vercel next).
   - **Plan B (scanner)** — token minting + `GitHubSecretsScanner` (gitleaks + redaction) +
     `run_repo_scan` task + internal `/api/repo-scans` + gitleaks in Dockerfile. *Next.*
   - **Plan C (report UI)** — `/repos` + `/repos/[repoId]`.
   - Then Vercel deploy webhooks. *(Slack dropped — too niche.)*
3. **Resend emails** — welcome, scan-complete, CVE alert.
4. **Stripe billing/portal reflection** — billing page + portal accurately reflect plan
   state, invoices, and subscription lifecycle.
5. **Pricing decisions** — reprice (see *Open product decisions*) before copy is finalised.
6. **Website accuracy + docs/FAQs** — reconcile homepage/billing copy with reality (see
   mismatches below); write documentation + FAQs.
7. **Detailed testing** — incl. backfilling `apps/web` route test coverage. `vitest` harness
   landed with the DELETE-url feature (2026-06-19); routes `urls` POST, `scans`, `verify`,
   `billing/*`, `webhooks`, `badge/[token]`, `admin/*` still untested.
8. **Stripe live payment processing** — create live-mode products + switch keys. *(Last.)*

**Launch blockers tracked separately (not in build sequence):** lawyer review of `/terms` +
`/privacy` + resolve `[BRACKETED]` placeholders; operational items — retention purge job +
account-deletion cascade verification (C3), sub-processor DPAs (C2).

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
| **Badge** "valid 30 days", "stays active automatically", `180/180` | Badge issuance now built (30-day expiry matches "valid 30 days"). "Stays active automatically" still aspirational — there is no auto-renewal/monitoring cron; re-scan renews. `180/180` is invented. |
| Pricing "$9 / scan … **1 URL, expires after scan**" | Starter is a persistent unlock (passive+active), not single-use and does not expire. Copy contradicts implementation. |
| Badge snippet `vibe-check.dev/b.js`, integrations `app.vibe-check.dev/hooks/…` | Domains/badge script not real. |

Honest claims that **are** backed: SSL/security headers, exposed endpoints (Supabase table/storage exposure), misconfigurations/secrets (Stripe test keys, CORS, leaked creds), TLS, rate-limiting.

---

## Known code issues

*(none currently open)*

**Resolved 2026-06-20 — duplicate "No Supabase backend detected" finding** (`scanners/storage_exposure.py`). When an app has no Supabase backend, the table-exposure **and** storage-exposure scanners each emitted an identical `info` finding with the same title, so reports showed the row twice (caught while eyeballing merlin's deep-scan PDF). Fixed: the storage scanner now returns `[]` when no creds are found and lets the table scanner own the single note. New behaviour pinned by `test_storage_exposure.py`. Scanner suite 159 passed. **Deployed to Fly + re-validated live** — merlin active re-scan now shows exactly one such row (was two).

**Resolved 2026-06-20 — `urls.verified` could be set without proof** (migration `20260620000022`). A few `urls` rows were `verified=true` with NULL `verification_method`/`verified_at` (and one `verified_at` predating its own `created_at`) — leftovers of direct service-role writes during early manual testing that bypassed `/api/verify` (the route always sets all three atomically after a real DNS/file/meta check). Not exploitable (only the service-role holder can write these), but a latent integrity hole. Reconciled the rows and added CHECK constraint `urls_verified_requires_proof` so `verified=true` can never again exist without method + verified_at. Applied to the live project; DNS TXT for the affected domain confirmed present before reconciling.

**Resolved 2026-06-20 — Nuclei silent timeout** (`scanners/nuclei.py`). Deep scans whose
Nuclei run exceeded the 300s budget caught `TimeoutExpired` → returned `None` → `run()`
returned `[]`: the **entire Nuclei dimension vanished from the report with no warning**, and
the partial JSONL Nuclei had already streamed was discarded. `merlin.systems` (deep) lost all
Nuclei findings this way; 2 of 3 validation targets rode the ceiling. Fixed: timeout now
**salvages partial output** + appends a visible `nuclei-incomplete` info finding (binary-missing
→ `nuclei-unavailable` info, no longer silent); budget raised **300s → 450s**; repeat matches of
one template are **collapsed into one finding listing the locations** (the 10× "missing security
headers" noise). New regression tests in `tests/test_nuclei.py`. Scanner suite 159 passed.
**Deployed + re-validated live** (merlin deep: 0 → 4 Nuclei findings, 316s, dupes collapsed).

**Resolved 2026-06-20 — `cert-expiry` finding missing** (`scanners/tls.py::_process_result()`). Root cause was **not** the trust-store warning originally hypothesised: the code read `cert_info.result.verified_certificate_chain[0]`, but sslyze 6.x `CertificateInfoScanResult` has no such attribute, so it raised `AttributeError` on **every** host and the bare `except: pass` swallowed it — `cert-expiry` was never emitted for any scan. Fixed to read the leaf from `certificate_deployments[0].received_certificate_chain[0].not_valid_after_utc` (intrinsic expiry, independent of path validation) and to emit an `info` finding instead of silently swallowing on parse failure. Regression tests added in `tests/test_tls.py` exercising `_process_result` (previously untested). Verified live against example.com. **Deployed + confirmed live** — all 3 validation-domain scans now emit `cert-expiry`. Merged to master (`85838ff`).

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
