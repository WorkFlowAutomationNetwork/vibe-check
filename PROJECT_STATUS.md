# PROJECT_STATUS.md — Vibe-Check

> **Living document.** Update whenever a feature, page, migration, or integration changes. Read at the start of every session. Keep it tight — record current state, not a diary.

---

## What this is

SaaS security auditing for "vibe-coded" apps. User gives a URL, verifies ownership, gets a graded report (headers, TLS, exposed Supabase tables/storage, leaked secrets, rate-limiting, Nuclei). Free = passive; paid = active/deep + badge + monitoring. Target user: indie founders who shipped fast with AI.

**Pricing (live):** Free $0 passive · Starter $9 one-off (active + badge) · Monitor $19/mo (continuous). *Reprice under consideration — see end of doc.*

---

## Current phase

> **Pre-launch.** All app pages built and wired to real Supabase data. Scanner deployed and live. Stripe checkout + subscription lifecycle verified end-to-end. Badge issuance + activity-log writes are **live in production** (scanner issues 30-day badges on active/deep completion; scanner + web write the activity feed — Fly.io redeploy shipped 2026-06-18). **Site is deployed to Vercel** (project `vibe-check-web`, team `wfan`) and live behind the **prelaunch coming-soon gate** (`vibe-check-app.com` now points at the app; `*.vercel.app` aliases also live). **Gate verified end-to-end 2026-06-21:** root serves coming-soon, notify form persists to `waitlist`, password unlock works. **Blocking launch:** lawyer review of `/terms` + `/privacy`; homepage overstates capabilities (see mismatches below).

---

## Infrastructure

| Service | Status | Notes |
|---|---|---|
| Next.js (`apps/web`) | ✅ Live | Next 14 App Router, TS strict. Build clean. |
| Supabase | ✅ Live | Project `lvkiflbpbtmlrgdftivt`. 25 migrations applied (waitlist applied to prod 2026-06-21). RLS on all tables. |
| Scanner (`apps/scanner`) | ✅ Deployed | `vibe-check-scanner.fly.dev`. FastAPI + Celery + Redis. ~142 tests passing. nuclei v3.9.0 pinned, 13k templates live. VM 2GB/2CPU, scan timeout 300s. |
| Redis | ✅ Deployed | Fly.io managed (`vibe-check-redis`). |
| Stripe | ✅ Wired | Test-mode products (`starter_one_off` $9, `monitor_monthly` $19/mo, by lookup_key). Checkout + portal + webhook all verified end-to-end. **Live keys/products not yet created.** |
| Resend (email) | ❌ Not wired | Key env var exists; no send calls anywhere. |

> **Note:** the 2026-06-17 Fly.io redeploy shipped all scanner work through that date (tech-disclosure, secrets, Supabase/Storage exposure, rate-limit, PDF, Nuclei). The scanner then went **5 days without a redeploy** (last deploy 2026-06-20, v13) while Plan B (GitHub committed-secret scanning) landed in the repo — so the live instance silently lacked the `/api/repo-scans` route and gitleaks entirely until the 2026-06-25 redeploy (`67417b4`) caught it up. Lesson: code being "complete" in git ≠ live; check `fly releases` against the latest scanner-touching commit before assuming.

---

## Database (key facts)

- 25 migrations applied (`supabase/migrations/`). All tables RLS-enabled; scanner uses service-role key (bypasses RLS). `waitlist` table (prelaunch notify capture) applied to prod 2026-06-21.
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
   - **Plan B (scanner) — ✅ code-complete** (verified 2026-06-21): `GitHubSecretsScanner`
     (`scanners/github_secrets.py` + `github_secrets_rules.py`), `run_repo_scan` task
     (`jobs/tasks.py:215`), internal `/api/repo-scans` route (+ tests), and gitleaks pinned
     in the Dockerfile (`v8.21.2`, multi-stage build). **Not yet validated end-to-end against a
     real repo, and Fly redeploy carrying gitleaks + `GITHUB_*` env not confirmed live** — that's
     the remaining GitHub go-live work.
   - **Plan C (report UI) — ✅ shipped 2026-06-21**: `/repos` list + `/repos/[repoId]`
     committed-secret report, both server components with client islands. `ScanRepoButton`
     ("Scan now" → POST `/api/repo-scans`, 3000ms polling, `router.refresh()` on terminal)
     on list rows and detail; `RepoStatusPill` (Never scanned / Scanning… / Clean / {n}
     secret(s) / Failed); `Repos` sidebar nav; GitHub `/integrations` card links into
     `/repos`. No A–F grade — status is Clean vs `{n} secrets exposed`; Full history /
     Incremental mode label; only redacted finding fields rendered; RLS-scoped queries +
     `notFound()`. 112 web tests pass; production build clean. Whole-branch opus review: Ship.
   - **Connect-flow hardening — 2026-06-22** (`7693960`, `5cfdadb`, `c7cf63e`): live testing
     surfaced that the install→callback path never recorded the installation. Root cause:
     GitHub's post-install redirect carries `installation_id` but **not** our `state`, and for
     already-installed users `installations/new` dead-ends on the configure page (Save
     redirects nowhere). Fixes: (a) round-trip the signed `state` via an httpOnly cookie
     instead of the query; (b) **enter via the OAuth authorize URL** (always redirects back
     with `code`), callback exchanges code → app-scoped user token → `GET /user/installations`
     → records each installation + repos (handles new, returning, and already-installed users);
     (c) disconnect now calls `DELETE /app/installations/{id}` for a **true revoke** with an
     ownership check (IDOR guard); (d) Connect/Manage-access open in a new tab; (e)
     `/api/integrations` exempted from the prelaunch gate. **Needs `GITHUB_APP_CLIENT_ID` set
     in Vercel** (previously unused). 118 web tests pass. End-to-end secret-scan validation
     still pending.
   - **✅ Connect flow live end-to-end — 2026-06-25** (`f191729`). Root cause of the
     `gh_error=1` bounce: GitHub's `/user/installations` returns `account.type` as
     `'User'`/`'Organization'`, but `github_installations_account_type_check` only allows
     `'user'`/`'org'` — every live upsert hit the constraint and threw. Fixed by normalizing
     the value in `lib/github/app.ts::listUserInstallations`.
   - **✅ Repo-scan enqueue + dispatch fixed — 2026-06-25** (`d6248d4`). "Scan now" 500'd:
     `repo_scans` has no client-side INSERT/DELETE policy (service-role-only writes, per the
     migration's own comment) but the route inserted via the user-scoped client. Fixed by
     using `createServiceClient()` for the insert/delete in `app/api/repo-scans/route.ts`.
   - **✅ Scanner-side go-live — 2026-06-25** (`67417b4`, scanner Fly deploy). The Fly image
     hadn't been rebuilt since 2026-06-20, so the live instance predated Plan B entirely —
     `/api/repo-scans` 404'd and gitleaks wasn't installed. Root cause of the *build* failure
     once attempted: gitleaks' GitHub repo was renamed to `gitleaks/gitleaks`, but its `go.mod`
     still declares the module path as the original `zricethezav/gitleaks/v8` — `go install`
     must target that path. Fixed the Dockerfile, set `GITHUB_APP_ID` +
     `GITHUB_APP_PRIVATE_KEY` as Fly secrets (previously absent), redeployed successfully.
   - **✅ End-to-end validated live — 2026-06-25.** Connected `WorkFlowAutomationNetwork/business-website`,
     ran a full-history scan from `/repos`, got back 3 real `medium` committed-secret findings
     (Resend API key, GCP/Firebase API key, a generic API key — all genuinely exposed in that
     repo's history since mid-2025, unrelated to Vibe-Check). Report UI rendered correctly.
     Note: a planted AWS-docs example key (`AKIAIOSFODNN7EXAMPLE`) was *not* flagged — expected,
     gitleaks allowlists that exact placeholder by default to suppress the most common false
     positive. **GitHub committed-secret scanning (Plans A/B/C) is now fully live in production,
     end to end.**
   - **✅ Finding actionability + landing stats — 2026-06-25** (`501a3b0`, migrations
     `20260625000025`/`20260625000026` applied to prod). Each finding now carries a
     best-effort `variable_name` (parsed from gitleaks' `Match` field, never the secret
     itself), a `still_live` flag (secret present at HEAD vs. history-only — changes
     remediation urgency), and **per-provider remediation** (Stripe/AWS/GitHub/OpenAI/GCP/
     Supabase/Slack/SendGrid/Twilio/Mailchimp get a specific rotation path instead of one
     generic line) — aimed at making a report copy-pasteable straight into an AI coding
     agent (Claude/Codex/Lovable) to action. `get_landing_stats` RPC extended with
     `repo_scans_run` (count of completed repo scans, not distinct repos) and
     `secrets_found` (total findings, all-time); landing page renders both as new pills.
     194 scanner tests + 118 web tests pass; web build clean. Verified against live data:
     RPC returns `repo_scans_run: 1, secrets_found: 3` matching today's real
     `business-website` scan.
   - Remaining: Vercel deploy webhooks. *(Slack dropped — too niche.)*
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

**Open — Plan C (repo report UI) review follow-ups** (all Minor; surfaced in the whole-branch
review at merge `c0776f6`, none blocking):
- **`act()` warning in `ScanRepoButton.test.tsx`** — the polling state update isn't wrapped in
  `act(...)`, so the test run emits a React warning. Output should be pristine; wrap the timer
  advance / state transition in `act()` (or `await waitFor`) to silence it.
- **`repo_findings.description` fetched but never rendered** (`app/(app)/repos/[repoId]/page.tsx`)
  — the column is in the `select` and the `RepoFinding` type but nothing renders it. Either render
  it under the finding title or drop it from the select + type to keep the interface honest.
- **Inline `style={{…}}` objects on the detail page** (`app/(app)/repos/[repoId]/page.tsx`) — panel
  backgrounds, severity badges, and finding cards use inline styles (brief-prescribed) where the
  rest of the app favours `app.css` classes. Extract to `app.css` for consistency with sibling pages.

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
- **Post-launch idea: pre-emptive (PR-time) secret scanning as an ultra-premium tier.**
  Current GitHub committed-secret scanning is reactive — it finds secrets already in
  history. A "shift-left" option: listen for the GitHub `pull_request` webhook (plumbing
  already exists via the GitHub App), scan just the diff, and post a GitHub Check
  (pass/fail) on the PR so a secret is caught **before** it merges to main, with zero
  local install required. True pre-commit prevention (stopping it before it leaves the
  dev's machine) would need a separate local hook/CLI install — different distribution
  model, more friction, parked as a stretch goal beyond this. Not started; revisit after
  launch.

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
supabase/migrations/               ← 24 migrations (applied)
design/                            ← HTML UI references (source of truth for component structure)
docs/superpowers/{specs,plans}/    ← dated specs + plans for scanner work
```


## Identified Extras:
- add a extra section on the overview that shows recent github/ vercel scans - greyed out if not subscribed
- Recent activity - each scan should have its own report. They can view the results of that specific scan. 
- Alert for badge renewal - encourages more usage. 
- check badge page - href tag has local host is that correct
- embedded or whatever for billing from stripe?
- need better revenue reporting ie should try and closely clone Stripe so I dont have to open it
- when connecting github needs to opena  new window rather than leaving the current one. Have connected and has read access but connection in app hasn't moved from 'Not connected'
- enusre im comfortable with the actual sign up flow
