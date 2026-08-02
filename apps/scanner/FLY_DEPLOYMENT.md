# Fly.io deployment — scanner service

> **STATUS: TORN DOWN 2026-08-03.** The `vibe-check-scanner` Fly app, its four
> machines, its secrets, its dedicated IPv6, and the `vibe-check-redis` managed
> Redis instance were all destroyed to stop ~$42/month of compute billing on a
> project that is paused. **Nothing on Fly.io remains.** This document is the
> complete record needed to stand it back up.
>
> The scanner code in `apps/scanner/` is untouched and still passes its test
> suite — only the hosting was removed. Restoring is a rebuild, not a rewrite.
>
> **No secret values appear in this file, deliberately.** See
> [Secrets](#secrets--where-each-value-comes-from) for where each one lives.

---

## 1. Why it was torn down

The scanner box ran 24/7 whether or not anyone scanned anything. Per
`apps/web/app/api/admin/infra-cost/route.ts` (the project's own cost estimator,
using Fly's published rates of `$0.0000016/s` per shared vCPU and
`$0.0000025/s` per GB RAM):

| Machine | Process | Size | State | Est. monthly |
|---|---|---|---|---|
| `683d6eeb564e18` `cool-forest-3954` | web | shared-cpu-2x / 2048MB | started | ~$21.25 |
| `e820904b210048` `spring-wood-1090` | worker | shared-cpu-2x / 2048MB | started | ~$21.25 |
| `185d9d2b201178` `broken-wave-9503` | web | shared-cpu-2x / 2048MB | stopped | $0 |
| `48ed1eeb0de2d8` `polished-brook-7113` | worker (standby) | shared-cpu-2x / 2048MB | stopped | $0 |

**~$42.50/month** for two always-on machines. `fly.toml` sets
`min_machines_running = 1`, so the web machine could never idle down to zero,
and the Celery worker has no HTTP service at all so `auto_stop_machines` never
applied to it — it simply ran forever.

This is the same fact recorded in `PROJECT_STATUS.md` under the pricing rework:
per-scan compute was effectively $0 marginal cost *because the box was already
paid for 24/7 regardless of scan volume*. With the project paused, that fixed
cost buys nothing.

---

## 2. Exact inventory as it existed at teardown

Captured 2026-08-03 immediately before destruction.

### App

```
Name      vibe-check-scanner
Owner     personal  (workflowautomationnetwork@gmail.com)
Hostname  vibe-check-scanner.fly.dev
Region    syd  (Sydney, Australia)
Image     vibe-check-scanner:deployment-01KX09NM2Z3527E7XD9KCRXVDD
Latest    v16 — deployed Jul 8 2026 07:26
Volumes   none  (nothing stateful lived on Fly)
Certs     none  (used the default *.fly.dev hostname; no custom domain)
```

### IP addresses

```
v6  2a09:8280:1::12a:cc0d:0   public ingress (dedicated)  allocated Jun 15 2026
v4  66.241.125.115            public ingress (shared)
```

Both are released by the app destroy. A restore gets **new** addresses. The
dedicated IPv6 was free; the shared IPv4 is Fly's default.

> **Region matters legally.** `syd` is load-bearing: the Privacy Policy and
> `/trust` page state that scan traffic originates from Sydney, Australia
> infrastructure, matched to Supabase (`ap-southeast-2`) and Vercel (`syd1`).
> A restore in a different region makes published legal copy false. See the
> 2026-07-01 entry in `PROJECT_STATUS.md`.

> **Egress IP was never static.** The live outbound IP was `79.127.166.163`
> (reverse-DNS `datapacket.com`, Fly's Sydney network provider), but Fly does
> not guarantee NAT'd egress IPs across restarts without a paid app-scoped
> egress IP (`fly ips allocate-egress`, $3.60/mo) — which was deliberately not
> provisioned. Do not publish a scanner IP allowlist on restore; the customer-
> facing copy correctly says "Sydney, Australia infrastructure" instead.

### Release history

16 releases between Jun 15 2026 and Jul 8 2026. Notable ones, cross-referenced
against `PROJECT_STATUS.md`:

| Release | Date | What it shipped |
|---|---|---|
| v2 | Jun 15 2026 | initial deploy |
| v9 | Jun 17 2026 | tech-disclosure, secrets, Supabase/Storage exposure, rate-limit, PDF, Nuclei |
| v10 | Jun 18 2026 | badge issuance + activity-log writes |
| v13 | Jun 20 2026 | TLS `cert-expiry` fix, duplicate-Supabase-finding fix |
| v15 | Jun 25 2026 | `67417b4` — gitleaks + `/api/repo-scans` + `GITHUB_*` secrets |
| v16 | Jul 8 2026 | final release before teardown |

### Redis

```
Name           vibe-check-redis
ID             G1BpZPq1kBboYUAypl1Yk1
Plan           Pay-as-you-go  (Fly-managed Upstash)
Primary region syd
Read regions   none
Eviction       Enabled
Auto-Upgrade   Disabled
ProdPack       Disabled
Private URL    redis://default:<PASSWORD>@fly-vibe-check-redis.upstash.io:6379
```

Purely a Celery job broker — no durable application state. Destroying it lost
nothing but in-flight queue entries. See §6 for the one consequence.

---

## 3. Secrets — where each value comes from

Fly secrets are **write-only**: the values could not be read back out, and they
are now gone from Fly permanently. These seven were set on the app:

| Secret | Where to re-source the value |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API. Also in local `scanner.env`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → `service_role`. Also in local `scanner.env`. |
| `SCANNER_INTERNAL_KEY` | Shared web↔scanner secret. **Must match** the value in Vercel's env for `vibe-check-web`. In local `scanner.env` and `web.env.local`. |
| `REDIS_URL` | Output of `fly redis status <name>` on the **newly created** Redis. The old value is dead. |
| `SCANNER_VERSION` | Free-form version string surfaced by `GET /health`. Tests default it to `0.1.0`. |
| `GITHUB_APP_ID` | GitHub App settings page. Also in local `web.env.local`. |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App settings → Private keys. In local `web.env.local`. If lost, generate a **new** key in GitHub — old `.pem` files are not re-downloadable. |

### The values still exist locally

Every one of these is present in the gitignored env files, which are symlinks
out of the repo into OneDrive:

```
apps/scanner/.env      -> C:\Users\paddy\OneDrive\Desktop\Coding\ENVS\vibecheck\Vibe-Check\scanner.env
apps/web/.env.local    -> C:\Users\paddy\OneDrive\Desktop\Coding\ENVS\vibecheck\Vibe-Check\web.env.local
```

`scanner.env` holds `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SCANNER_INTERNAL_KEY`, `SCANNER_VERSION`, `REDIS_URL`, `MAX_CONCURRENT_SCANS`,
`WEB_NOTIFY_URL`. The two `GITHUB_APP_*` values are in `web.env.local`, not
`scanner.env` — the scanner read them only from Fly secrets.

**So the teardown is recoverable as long as that OneDrive folder survives.** If
it does not, everything above must be re-sourced from the Supabase and GitHub
dashboards, and `SCANNER_INTERNAL_KEY` regenerated on both sides.

> Note: `scanner.env` carries `MAX_CONCURRENT_SCANS` and `WEB_NOTIFY_URL`, which
> were **not** set as Fly secrets — the deployed app fell back to code defaults
> for both. Check `lib/settings.py` before assuming production behaviour matched
> local.

---

## 4. Restore runbook

### 4.0 Prerequisites

`flyctl` is **not on PATH** on this machine. It lives at:

```
C:\Users\paddy\.fly\bin\flyctl.exe          # v0.4.67
```

From Git Bash, either add it to PATH or alias it:

```bash
FLY=/c/Users/paddy/.fly/bin/flyctl.exe
"$FLY" auth login
```

Ignore the `Warning: Metrics token unavailable` line — it is noise, not failure.

### 4.1 Create the app

```bash
cd apps/scanner            # MUST be this directory — see gotcha in §5
"$FLY" apps create vibe-check-scanner --org personal
```

If the name is taken (Fly names are global and may not free up instantly), pick
a new one and update `app =` in `fly.toml` plus `SCANNER_API_URL` in Vercel.

### 4.2 Recreate Redis

```bash
"$FLY" redis create --name vibe-check-redis --region syd --org personal
"$FLY" redis status vibe-check-redis        # copy the Private URL
```

Choose the eviction-enabled, pay-as-you-go plan to match the original.

### 4.3 Set secrets

```bash
"$FLY" secrets set -a vibe-check-scanner \
  SUPABASE_URL='...' \
  SUPABASE_SERVICE_ROLE_KEY='...' \
  SCANNER_INTERNAL_KEY='...' \
  REDIS_URL='redis://default:...@fly-vibe-check-redis.upstash.io:6379' \
  SCANNER_VERSION='0.1.0' \
  GITHUB_APP_ID='...'

# Multiline PEM — pass via file, not inline
"$FLY" secrets set -a vibe-check-scanner GITHUB_APP_PRIVATE_KEY="$(cat path/to/key.pem)"
```

### 4.4 Deploy

```bash
cd apps/scanner
"$FLY" deploy --remote-only
```

`--remote-only` builds on Fly's builders. The Docker build is heavy — it
compiles Nuclei and gitleaks from Go source and pulls ~13k Nuclei templates —
so expect several minutes.

### 4.5 Point the web app back at it

Set `SCANNER_API_URL` in Vercel (project `vibe-check-web`, team `wfan`) to the
new hostname, then redeploy the web app:

```
SCANNER_API_URL = https://vibe-check-scanner.fly.dev
```

Four web routes call it and will 500 until this is set:

- `apps/web/app/api/scans/route.ts` → `POST /api/scans`
- `apps/web/app/api/repo-scans/route.ts` → `POST /api/repo-scans`
- `apps/web/app/api/webhooks/route.ts` → `POST /api/scans`
- `apps/web/app/api/webhooks/vercel/[token]/route.ts` → `POST /api/scans`

`SCANNER_INTERNAL_KEY` must be identical on both sides or every call is
rejected by `api/middleware/auth.py`.

### 4.6 Verify

```bash
curl https://vibe-check-scanner.fly.dev/health
# expect: {"status":"ok","version":"<SCANNER_VERSION>"}

"$FLY" status -a vibe-check-scanner    # web machine passing its health check
"$FLY" logs -a vibe-check-scanner      # worker should log Celery ready
```

Then run one real end-to-end scan from the dashboard against an
ownership-verified URL and confirm a graded report plus PDF lands in Supabase.
A passing `/health` only proves the web process booted — it says nothing about
the worker, Redis connectivity, or the CLI tools.

---

## 5. Gotchas worth not rediscovering

These cost real debugging time the first time round. Sources: `PROJECT_STATUS.md`
and `CLAUDE.md`.

- **Deploy from `apps/scanner/`, not the repo root.** The Dockerfile sits beside
  `fly.toml`; running `flyctl deploy` from the root fails to find it.

- **"Complete in git" ≠ "live".** The scanner once went 5 days without a
  redeploy while `/api/repo-scans` and gitleaks landed in the repo — the live
  instance silently lacked the route entirely until v15 caught it up. On restore,
  check `fly releases` against the latest scanner-touching commit.

- **Nuclei and gitleaks are pinned on purpose** (`nuclei@v3.9.0`,
  `gitleaks@v8.21.2`). Unpinned `@latest` could silently change CLI flags and
  degrade a scanner into a quiet "ran clean, zero findings" result instead of a
  loud build break. Do not "helpfully" unpin them.

- **Nuclei templates are baked in at build time**, not fetched at runtime —
  template freshness is intentionally tied to redeploys. `-update-templates`
  writes to `~/nuclei-templates`, *not* `~/.config/nuclei` (which holds only
  nuclei's own config and ignore-list). Both are COPYed in the Dockerfile.

- **WeasyPrint needs system libs.** PDF rendering requires Pango/Cairo/GObject
  (`libpango-1.0-0`, `libpangocairo-1.0-0`, `libcairo2`, `libgdk-pixbuf-2.0-0`,
  `libffi8`, `shared-mime-info`) — they are not bundled with the pip package.
  `git` is also installed for repo scanning.

- **Nuclei timeout is 450s, and that number is hard-won.** 120s was the original
  plan and killed almost every real scan; 300s still let `merlin.systems` time
  out and lose its whole Nuclei dimension. SQLmap 90s, DalFox 60s.

- **Consent is enforced at the task level**, in `jobs/tasks.py`, not just at the
  API layer. Every scan calls the consent check before any tool runs. Do not
  move that check to the API boundary on restore.

---

## 6. Loose ends created by the teardown

- **Any scan sitting in `pending` or `running` in Supabase is now orphaned.**
  Its Celery job died with the Redis instance and no worker will ever finish it,
  so it will show as a permanent spinner. Sweep those rows to `failed` before
  reopening the site to users. This is invisible for now because the site is
  behind the full prelaunch wall.

- **Badges lapse naturally.** Issued badges are 30-day and stored in Supabase;
  the web app serves badge images from the DB, so existing badges keep rendering
  until they expire on their own. No new badges can be issued while the scanner
  is down, since issuance happens in `jobs/tasks.py` on active/deep completion.

- **`FLY_API_TOKEN` in Vercel is now inert.** The admin infra-cost panel
  (`/api/admin/infra-cost`, `components/admin/InfraCostPanel.tsx`) queries
  `api.machines.dev` for `vibe-check-scanner` and will report an error or an
  empty machine list. It degrades gracefully — the route already handles both a
  missing token and a failed fetch — so this is cosmetic, not broken. Consider
  revoking the token if the pause is long.

- **Deploy webhooks are dead ends.** Any GitHub/Vercel integration still
  configured will fire into `/api/webhooks`, which forwards to a scanner that no
  longer exists. Requests fail; nothing corrupts.
