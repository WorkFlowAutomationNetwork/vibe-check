# GitHub committed-secret scanning — design

**Date:** 2026-06-20
**Status:** Approved design (pre-implementation)
**Launch step:** ② Integrations — GitHub (Slack dropped; Vercel follows separately)

---

## 1. Purpose

Let a user connect their GitHub repositories and scan them for **committed secrets**
(Supabase service-role keys, Stripe `sk_live_…`, OpenAI keys, `.env` contents, private
keys, etc.). This catches the single highest-severity, highest-frequency mistake our
target audience — indie/AI "vibe" builders — actually make, and it catches what the URL
scan *fundamentally cannot see*: server-side code, `.env` files, and anything never
shipped to the browser.

Results are a **standalone repo report**, separate from URL scans. Repo scans have no
A–F grade; a secret scan is pass/fail, so the headline is **"Clean"** or **"N secrets
exposed"** with severity counts.

### Scan depth model (decided)

- **First scan of a repo = full git history.** Secrets are frequently committed and then
  "removed" in a later commit while remaining recoverable in history — that is where a
  large share of real leaks live, so the baseline must be a full-history scan.
- **Subsequent scans = incremental** — only commits since the last scanned SHA.
- The report **always states which mode ran**: *"Full history"* or
  *"Incremental — N new commits since \<date\>"*.

---

## 2. Out of scope for v1 (documented fast-follows)

- **Push-event auto-triggering** of scans. The webhook handler will recognise push
  events but will not enqueue scans in v1.
- **"Secrets found" email alerts** — belongs to launch step ③ (email).
- **Dependency-CVE matching** — a separate, larger project (manifest reader + CVE feed).
- **GitLab / Bitbucket** providers.
- **Non-default branches** — v1 scans the default branch's history only.
- **Scan-oversight panel** — a dedicated "here is exactly what we accessed" view for the
  user (requested as a post-deploy nice-to-have). v1 already records the auditable basics
  (mode, base→head SHA, `commits_scanned`, `last_scan_at`, per-finding file/commit), so
  the data exists; the dedicated UI is future work.

---

## 3. Authentication — GitHub App

We use a **GitHub App** (not an OAuth App). Rationale: fine-grained
`Repository contents: Read-only` permission on **user-selected repositories only**,
short-lived installation tokens minted on demand (we never store a long-lived user
token), native per-repo selection at install, and per-installation revocation the user
controls from GitHub settings. This is the correct posture for a security product and
matches the existing design mock ("`contents:read` on N repos").

### Operational setup (one-time, performed by the operator)

Create a GitHub App with:
- **Permissions:** `Repository contents: Read-only` (nothing else).
- **Webhook events:** `installation`, `installation_repositories`.
- **Callback URL:** `${APP_URL}/api/integrations/github/callback`
- **Webhook URL:** `${APP_URL}/api/webhooks/github`
- Generate a private key.

Environment variables (web app):
```
GITHUB_APP_ID=
GITHUB_APP_SLUG=                 # for building the install URL
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=          # PEM; newlines escaped
GITHUB_WEBHOOK_SECRET=
```
Scanner: **gitleaks** installed in the Dockerfile (Go binary, same pattern as
Nuclei/DalFox). The scanner mints installation tokens itself, so it also needs
`GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`.

---

## 4. Tooling — clone + gitleaks

The scanner clones the repo into an ephemeral tmpdir using a minted installation token
and runs **gitleaks**:
- **Full:** `gitleaks detect --source <dir> --report-format json --report-path <out>`
- **Incremental:** add `--log-opts="<base_sha>..HEAD"`

Repo code is **only ever read by gitleaks** — never built, installed, or executed. The
clone is deleted after every scan (success or failure). A hard timeout and a repo-size
cap bound resource use on Fly.

**Force-push / rebase edge case:** if `last_scanned_sha` is no longer an ancestor of HEAD
(`git merge-base --is-ancestor` fails), the scanner falls back to a **full** re-scan
rather than silently missing commits.

---

## 5. Data model

All tables RLS-protected; user owns their rows; scanner writes via the service role
(same pattern as `urls`/`scans`/`findings`).

```
github_installations
  id uuid pk, user_id uuid, installation_id bigint unique, account_login text,
  account_type text (user|org), status text (active|suspended|revoked),
  created_at timestamptz

repos
  id uuid pk, installation_id uuid → github_installations, user_id uuid,
  github_repo_id bigint, full_name text, default_branch text,
  last_scanned_sha text null, last_scan_at timestamptz null,
  status text (active|removed), created_at timestamptz
  unique (installation_id, github_repo_id)

repo_scans
  id uuid pk, repo_id uuid → repos, user_id uuid,
  mode text (full|incremental), status text (pending|running|completed|failed),
  base_sha text null,             -- null for full
  head_sha text null,
  commits_scanned int null, secrets_found int null,
  triggered_by text (manual|webhook), started_at timestamptz null,
  completed_at timestamptz null, scanner_version text, error text null,
  created_at timestamptz

repo_findings
  id uuid pk, repo_scan_id uuid → repo_scans, user_id uuid,
  rule_id text,                   -- gitleaks rule (e.g. stripe-access-token)
  severity text (critical|medium|low|info),
  title text, description text,
  file_path text, commit_sha text, line_start int null,
  fingerprint text,               -- gitleaks commit:file:rule:line — non-sensitive
  match_preview text,             -- masked, e.g. "sk_live_abc…7f9x"
  commit_author text null, committed_at timestamptz null,
  remediation text, first_seen_at timestamptz
```

### Two deliberate data calls

1. **We never store the raw secret.** gitleaks returns the matched secret; we persist only
   the non-sensitive `fingerprint`, a masked `match_preview`, and location/metadata. This
   follows the CLAUDE.md rule against storing sensitive payloads — a security product must
   not itself become a secret store. `fingerprint` also lets incremental scans recognise an
   already-reported leak.
2. **No A–F grade for repos.** Repo report status is `clean` vs `exposed` (derived from
   `secrets_found`), with severity counts. URL scans keep their grade.

**Severity assignment.** gitleaks does not emit a severity per finding, so we assign it
via a `rule_id → severity` map maintained scanner-side: live/usable credential patterns
(e.g. `stripe-access-token`, `aws-access-key`, Supabase service-role JWT, private keys,
generic high-entropy API keys) → `critical`; lower-confidence/generic matches → `medium`;
unknown rules default to `medium`. The map lives next to the scanner and is unit-tested.

---

## 6. End-to-end flow

### Connect (web)
1. **"Connect GitHub"** → `GET /api/integrations/github/install` redirects to the GitHub
   App install page with a signed `state` (CSRF).
2. User selects repos on GitHub → redirect to
   `GET /api/integrations/github/callback?installation_id=…&state=…`. We verify `state`,
   record the `github_installation`, mint an installation token, list granted repos, and
   upsert `repos`.
3. `POST /api/webhooks/github` keeps state in sync: `installation`
   (suspended/revoked/deleted) and `installation_repositories` (repos added/removed),
   with `X-Hub-Signature-256` verified against `GITHUB_WEBHOOK_SECRET`. Push events are
   recognised but **not** acted on in v1.

### Scan (web → scanner)
- **"Scan now"** on a repo → `POST /api/repo-scans` inserts a pending `repo_scan`, picks
  `mode` (`full` if `last_scanned_sha` is null else `incremental`), and POSTs the
  scanner's internal `POST /api/repo-scans` with `X-Internal-Key` — mirroring the URL-scan
  dispatch. One in-flight scan per repo (reject duplicate enqueue). UI polls status.

### Scanner job (`run_repo_scan` Celery task → `GitHubSecretsScanner`)
1. **Authorization gate** (consent-equivalent for repos): load scan→repo→installation;
   abort + log unless the installation is `active` and the repo belongs to the requesting
   user. Non-negotiable, mirroring `consent.verify` for URLs.
2. Mint a short-lived installation access token (App JWT signed with the private key →
   installation token, scoped to the repo).
3. Clone full history into an ephemeral tmpdir using the token. Hard timeout + size cap;
   token redacted in the activity log.
4. Run gitleaks (full, or `--log-opts=<base>..HEAD` for incremental) → JSON.
5. Parse → `repo_findings` (redacted), count secrets, set `repo.last_scanned_sha = HEAD`
   and `last_scan_at`; write `repo_scan` results (`base_sha`, `head_sha`,
   `commits_scanned`, `secrets_found`).
6. **Always delete the clone.** Failures retry 3× with backoff, then mark `failed` — same
   policy as URL scans.

### Report (web)
- `/repos` — connected repos with latest status and a "Scan now" action.
- `/repos/[repoId]` — latest scan: headline **Clean** / **N secrets exposed**; mode label
  (*Full history* / *Incremental — N new commits since \<date\>*); findings grouped by
  severity with masked previews, file·commit·author, remediation; plus past-scan history.

---

## 7. Integrations page honesty (folded into v1)

The current `/integrations` page is a static mock containing fabricated data. As part of
this work we stop showing fabricated data as if real:
- **GitHub card** → wired to real state. Its data-handling copy is **corrected** (see
  §8) — the old "we read `package.json` and lock files only, code is never stored" was
  tied to the abandoned CVE concept and is replaced with an accurate description of the
  secret scan.
- **Vercel card** → honest **"coming soon"** state until launch step ② (Vercel). Not
  wired here.
- **Fake API key block and fake deploy-hook log** → removed or replaced with honest
  empty/placeholder states rather than displayed as real.

---

## 8. Data-handling copy (accuracy is a requirement, not decoration)

Because we changed *what* we read, the user-facing privacy claim must change with it. The
GitHub connect screen and card must state, accurately:

> To find committed secrets we read all files across your selected repositories' git
> history. We never retain your code — the clone is deleted after every scan — and we
> never store the secrets themselves, only redacted findings (the rule that matched, the
> file, a masked preview, and the location). We request read-only access to the specific
> repos you choose, and you can revoke it any time from GitHub → Settings → Applications.

A test/checklist item verifies the shipped copy matches actual behaviour (full-history
read; clone deleted; only redacted findings stored; read-only; user-selected repos).

---

## 9. Safety summary

- **Authorization gate** mirrors `consent.verify`: scan only repos whose installation is
  active and owned by the requesting user.
- **Webhook signature** (`X-Hub-Signature-256`) and **install `state`** (CSRF) verified.
- **Tokens never logged**; clone URL redacted in the activity log.
- **Repo code never executed** — gitleaks text scan only.
- **No raw secrets persisted** — redacted findings only; clone deleted after each scan.
- Internal scanner endpoint stays behind `X-Internal-Key`, same as URL scans.

---

## 10. Components / file map (anticipated)

**Web (`apps/web`):**
- `lib/github/app.ts` — App JWT, install URL, installation-token minting, REST helpers.
- `app/api/integrations/github/install/route.ts` — redirect with signed state.
- `app/api/integrations/github/callback/route.ts` — verify state, record install, sync repos.
- `app/api/webhooks/github/route.ts` — signature-verified install/repo sync.
- `app/api/repo-scans/route.ts` — enqueue + status poll.
- `app/(app)/repos/page.tsx`, `app/(app)/repos/[repoId]/page.tsx` — report surface.
- `components/integrations/*` — honest GitHub/Vercel cards.

**Scanner (`apps/scanner`):**
- `lib/github_app.py` — installation-token minting (App JWT).
- `scanners/github_secrets.py` — `GitHubSecretsScanner` (clone + gitleaks + redact).
- `jobs/tasks.py` — `run_repo_scan` task + authorization gate.
- `api/routes/repo_scans.py` — internal enqueue endpoint.
- `Dockerfile` — install gitleaks.

**DB (`supabase/migrations`):** one migration creating the four tables + RLS policies.

**Shared types (`packages/shared`):** repo-scan status / finding shapes.

---

## 11. Testing strategy

- **Scanner (pytest, TDD):** gitleaks JSON → redacted findings (no raw secret leaks into
  any stored field); full vs incremental `--log-opts` argument construction; force-push
  fallback to full; authorization gate aborts on inactive/foreign installation; clone
  always cleaned up.
- **Web (vitest):** install `state` verification; callback repo upsert; webhook signature
  verification + sync; `/api/repo-scans` mode selection + duplicate-enqueue rejection.
- **Copy accuracy:** assertion that the data-handling copy reflects actual behaviour.
- Token minting and GitHub REST calls are mocked; no live GitHub calls in tests.
```
