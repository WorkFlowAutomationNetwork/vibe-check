# CLAUDE.md — Vibe-Check

> Read this file at the start of every session. It defines the full project context, architecture, conventions, and setup. Update it as required as the platform grows and changes to ensure it stays up to date, accurate and relevant

---

## Project status

**Always read [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) at the start of every session.**

It is the living record of what is built, what is wired, what is broken, and what to build next. Use it to answer questions like "what's the status of X?", "what should we do next?", "is Y implemented?".

**Update `PROJECT_STATUS.md` after every session that includes:**
- A new page or component built
- An API route added or changed
- A Supabase migration written or applied
- A Stripe integration step completed
- A known issue fixed or discovered
- Any change to the scanner service

---

## What this is

Vibe-Check is a SaaS security auditing tool for vibe-coded apps. Users provide a URL, verify ownership, and receive a graded security report covering headers, exposed endpoints, prompt injection vulnerabilities, dependency CVEs, and more. Paid tiers add active scanning, shareable reports, an embeddable trust badge, and continuous monitoring with deploy-triggered re-scans via GitHub/Vercel webhooks.

**Target user:** indie founders and solo builders who shipped something fast with AI and want to know if it's actually secure.

**Pricing:** Free (passive scan) / $9 one-off (full active scan + badge) / $19/month (continuous monitoring, multiple URLs, CVE alerts).

---

## Architecture

Two services. They must stay separate — scan jobs run 30–120 seconds, use system CLIs, and cannot run in serverless functions.

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│  apps/web  (Next.js)            │     │  apps/scanner  (Python/FastAPI)  │
│  Vercel                         │────▶│  Railway / Fly.io / Hetzner VPS  │
│                                 │     │                                  │
│  - Landing page                 │     │  - Scan job queue (Celery+Redis) │
│  - Dashboard / all UI           │     │  - Nuclei orchestration          │
│  - Auth (Supabase)              │     │  - SQLmap, DalFox, SSLyze        │
│  - Billing (Stripe)             │     │  - Prompt injection module       │
│  - API routes (non-scan)        │     │  - Report generation (PDF)       │
│  - Webhook receipt              │     │  - Supabase result writes        │
└─────────────────────────────────┘     └──────────────────────────────────┘
         │                                          │
         └──────────────┬───────────────────────────┘
                        │
              ┌──────────────────┐
              │   Supabase       │
              │  - Postgres DB   │
              │  - Auth          │
              │  - Storage (PDFs)│
              └──────────────────┘
                        │
                   ┌─────────┐
                   │  Redis  │
                   │  Queue  │
                   └─────────┘
```

**Rule:** API routes in `apps/web` never execute scans directly. They validate, enqueue, and return a job ID. The scanner service does all execution.

---

## Directory structure

```
vibe-check/
├── apps/
│   ├── web/                          # Next.js 14 App Router
│   │   ├── app/
│   │   │   ├── (marketing)/          # Landing, pricing (unauthenticated)
│   │   │   ├── (auth)/               # Sign in, sign up, reset password
│   │   │   ├── (app)/                # Dashboard, reports, settings (authenticated)
│   │   │   │   ├── dashboard/
│   │   │   │   ├── report/[scanId]/
│   │   │   │   ├── report/[scanId]/public/  # Shareable stripped report
│   │   │   │   ├── onboard/          # Add URL + ownership verification
│   │   │   │   ├── badge/
│   │   │   │   ├── integrations/
│   │   │   │   ├── settings/
│   │   │   │   └── billing/
│   │   │   └── api/
│   │   │       ├── auth/             # Supabase auth callbacks
│   │   │       ├── billing/          # Stripe webhooks + portal
│   │   │       ├── scans/            # Enqueue scan, poll status
│   │   │       ├── verify/           # DNS/file ownership verification
│   │   │       ├── webhooks/         # Vercel/Netlify deploy hooks
│   │   │       └── badge/[token]/    # Badge public verification endpoint
│   │   ├── components/
│   │   │   ├── ui/                   # Design system components
│   │   │   ├── dashboard/
│   │   │   ├── report/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── supabase/             # Client + server + middleware
│   │   │   ├── stripe/               # Stripe client + helpers
│   │   │   ├── redis/                # BullMQ queue client
│   │   │   └── utils/
│   │   ├── types/                    # TypeScript types (re-exported from packages/shared)
│   │   ├── middleware.ts             # Auth middleware
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts        # Minimal — design system uses CSS vars
│   │   └── package.json
│   │
│   └── scanner/                      # Python 3.12 FastAPI service
│       ├── api/
│       │   ├── main.py               # FastAPI app entry
│       │   ├── routes/
│       │   │   ├── scans.py          # Internal: receive + run scan jobs
│       │   │   └── health.py
│       │   └── middleware/
│       │       └── auth.py           # Verify internal API key from web app
│       ├── scanners/
│       │   ├── base.py               # Abstract scanner interface
│       │   ├── nuclei.py             # Nuclei wrapper — primary scanner
│       │   ├── headers.py            # SSL/TLS + security headers (passive)
│       │   ├── endpoints.py          # Common path probing
│       │   ├── prompt_injection.py   # AI endpoint fuzzer (custom)
│       │   ├── secrets.py            # SecretFinder JS bundle scanner
│       │   ├── sqli.py               # SQLmap wrapper (scoped)
│       │   ├── xss.py                # DalFox wrapper
│       │   └── tls.py                # SSLyze wrapper
│       ├── queue/
│       │   ├── worker.py             # Celery worker
│       │   ├── tasks.py              # Scan task definitions
│       │   └── config.py             # Redis / Celery config
│       ├── reports/
│       │   ├── grader.py             # Grade calculation (A–F)
│       │   ├── renderer.py           # PDF report generation (WeasyPrint)
│       │   └── templates/            # HTML templates for PDF
│       ├── lib/
│       │   ├── supabase.py           # supabase-py client
│       │   ├── consent.py            # Ownership verification check before scan
│       │   └── storage.py            # Upload PDFs to Supabase Storage
│       ├── requirements.txt
│       └── Dockerfile
│
├── packages/
│   └── shared/                       # Shared TypeScript types
│       ├── src/
│       │   ├── scan.ts               # Scan status, finding severity enums
│       │   ├── report.ts             # Report shape, grade type
│       │   └── index.ts
│       └── package.json
│
├── supabase/
│   ├── migrations/                   # SQL migration files
│   └── seed.sql                      # Dev seed data
│
├── infra/
│   ├── docker-compose.yml            # Local dev: Redis + scanner + web
│   └── fly.toml                      # Scanner deploy config (Fly.io)
│
├── .env.example                      # All required env vars documented
└── CLAUDE.md                         # This file
```

---

## Tech stack

### apps/web — Next.js

| Purpose | Package |
|---|---|
| Framework | `next@14` (App Router) |
| Language | `typescript` strict |
| Auth | `@supabase/supabase-js` + `@supabase/ssr` |
| Database client | `@supabase/supabase-js` |
| Payments | `stripe` + `@stripe/stripe-js` |
| Job queue client | `bullmq` + `ioredis` |
| Schema validation | `zod` |
| Email | `resend` |
| Styling | CSS variables (custom design system, see Design System section) |
| PDF viewing | `react-pdf` |

```bash
# Install
npm install next react react-dom typescript @supabase/supabase-js @supabase/ssr stripe @stripe/stripe-js bullmq ioredis zod resend
npm install -D @types/react @types/node tailwindcss postcss autoprefixer
```

### apps/scanner — Python FastAPI

| Purpose | Package |
|---|---|
| Framework | `fastapi` |
| Server | `uvicorn[standard]` |
| Job queue | `celery[redis]` |
| Redis client | `redis` |
| HTTP client | `httpx` |
| Schema validation | `pydantic` |
| Supabase | `supabase` |
| SSL analysis | `sslyze` |
| PDF generation | `weasyprint` |
| Env management | `python-dotenv` |
| Auth token verify | `python-jose[cryptography]` |

```bash
# requirements.txt
fastapi
uvicorn[standard]
celery[redis]
redis
httpx
pydantic
supabase
sslyze
weasyprint
python-dotenv
python-jose[cryptography]
```

### Security tools — system-level installs on scanner server

These are CLI tools called via subprocess, not Python packages. Install on the scanner server (Dockerfile handles this).

| Tool | Purpose | Install |
|---|---|---|
| **Nuclei** | Primary vulnerability scanner — 9000+ templates | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` |
| **SQLmap** | SQL injection detection | `pip install sqlmap` |
| **DalFox** | XSS detection | `go install github.com/hahwul/dalfox/v2@latest` |
| **SecretFinder** | API key / secret detection in JS bundles | `git clone https://github.com/m4ll0k/SecretFinder && pip install -r requirements.txt` |
| **SSLyze** | TLS/SSL analysis | `pip install sslyze` (already in requirements) |

**Nuclei templates:** Pull the community template library separately.

```bash
nuclei -update-templates
```

Custom Vibe-Check templates live in `apps/scanner/scanners/nuclei-templates/` — these cover prompt injection patterns and AI-specific checks not in the community library.

**Critical:** All scanner tool invocations must check `consent.py` first. No tool runs against a URL that hasn't been ownership-verified. This is enforced at the task level in `queue/tasks.py`, not just at the API layer.

---

## ECC components to install

Pull from `https://github.com/affaan-m/ECC`. Do not use `--profile full`. Cherry-pick only.

```bash
git clone https://github.com/affaan-m/ECC.git /tmp/ecc

# Rules — copy into project root .claude/rules/
mkdir -p .claude/rules/ecc
cp -r /tmp/ecc/rules/common .claude/rules/ecc/
cp -r /tmp/ecc/rules/typescript .claude/rules/ecc/
cp -r /tmp/ecc/rules/python .claude/rules/ecc/

# Skills — copy into project root .claude/skills/
mkdir -p .claude/skills/ecc
cp -r /tmp/ecc/skills/backend-patterns .claude/skills/ecc/
cp -r /tmp/ecc/skills/frontend-patterns .claude/skills/ecc/
cp -r /tmp/ecc/skills/api-design .claude/skills/ecc/
cp -r /tmp/ecc/skills/database-migrations .claude/skills/ecc/
cp -r /tmp/ecc/skills/deployment-patterns .claude/skills/ecc/
cp -r /tmp/ecc/skills/docker-patterns .claude/skills/ecc/
cp -r /tmp/ecc/skills/security-review .claude/skills/ecc/
cp -r /tmp/ecc/skills/python-patterns .claude/skills/ecc/
cp -r /tmp/ecc/skills/python-testing .claude/skills/ecc/
cp -r /tmp/ecc/skills/tdd-workflow .claude/skills/ecc/

# Reference example (read, adapt to this project, don't copy verbatim)
cat /tmp/ecc/examples/saas-nextjs-CLAUDE.md
```

**Do not install:** anything Java, Swift, Kotlin, Go, Rust, PHP, Perl, ML/MLOps, HarmonyOS, multi-agent orchestration, Cursor/Codex-specific configs, or the continuous learning system. These bloat the context window.

---

## Database schema

All tables live in Supabase (Postgres). Row Level Security is enabled on every table. Migrations in `supabase/migrations/`.

```sql
-- Core tables (abbreviated — full schema in supabase/migrations/)

profiles            -- extends auth.users: plan, stripe_customer_id, stripe_subscription_id
urls                -- user_id, url, verified bool, verification_token, verification_method, created_at
scans               -- url_id, user_id, type (passive|active|deep), status, grade, started_at, completed_at, scanner_version
findings            -- scan_id, severity (critical|medium|low|info|pass), category, title, description, what_we_did, remediation, first_seen_at
badges              -- url_id, scan_id, status (active|lapsed|revoked), public_token, expires_at
activity_log        -- user_id, event_type, payload jsonb, created_at
integrations        -- user_id, type (github|vercel|netlify|slack), config jsonb (encrypted), status, last_triggered_at
webhook_log         -- integration_id, source, payload jsonb, scan_id, response_code, created_at
api_keys            -- user_id, key_hash, name, last_used_at, created_at
```

**RLS rules:** Users can only read/write their own rows. The scanner service uses a service role key (server-side only, never exposed to client). Public badge endpoint has a separate anon-accessible view on `badges` filtered by `public_token`.

---

## Design system

The UI was designed before build began. CSS variables are defined in `app/globals.css`. Do not introduce Tailwind utility classes that conflict — use the variables.

```css
--bg: #FAFAF7;
--bg-card: #FFFFFF;
--bg-sub: #F2F2EC;
--ink: #0F0F0E;
--ink-soft: #54544F;
--ink-mute: #8A8A82;
--line: #E6E6DE;
--violet: #7C3AED;
--violet-deep: #5B21B6;
--violet-soft: #EDE4FE;
--lime: #C6F24E;
--lime-deep: #A9D936;
--danger: #E25C3A;
--warn: #D88934;
--radius-sm: 2px;
--radius: 4px;
--font-display: 'Space Grotesk', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

Shadow pattern for interactive cards: `box-shadow: 6px 6px 0 var(--ink)`. Hover state shifts to `translate(-2px, -2px); box-shadow: 8px 8px 0 var(--violet)`.

Reference HTML designs are in `/design/` — use these as the source of truth for component structure and copy.

---

## Key conventions

**Scan safety (non-negotiable):**
- Every scan task in `queue/tasks.py` calls `consent.verify(url)` before any tool runs. If verification fails, the task aborts and logs the attempt.
- Scanner results are stored as likelihood assessments ("would likely succeed") not confirmed exploits. We do not store actual payload responses that contain sensitive user data.
- Scanner service IP ranges are published at `/trust` — users add these to WAF allowlists.

**TypeScript:**
- Strict mode always on.
- Server components by default. Add `'use client'` only when genuinely needed (interactivity, browser APIs).
- Zod schemas for all API route inputs. Never trust `req.body` directly.
- Supabase server client in Server Components/Route Handlers. Browser client only in Client Components.

**Python:**
- Type hints on every function signature.
- Pydantic models for all API request/response shapes.
- Subprocess calls to CLI tools always use `timeout` parameter. Nuclei: 300s max (measured ~257s for the curated safe-tag scope against a real target on the production VM — 120s was the original plan but killed almost every real scan). SQLmap: 90s max. DalFox: 60s max.
- All subprocess calls log the full command (redacted of any tokens) to the activity log.

**API design:**
- Internal scanner API is not public-facing. It accepts only requests with a shared secret (`SCANNER_INTERNAL_KEY`) set in env vars on both services.
- Public-facing API keys (for deploy webhook triggering) are hashed with bcrypt before storage. Never log raw keys.

**Queue:**
- Scan jobs are idempotent — running the same scan twice produces two separate scan records, not an overwrite.
- Failed jobs retry 3 times with exponential backoff. After 3 failures, mark scan as `failed` in DB and notify user.
- One scan per URL at a time per user. Reject duplicate enqueue if a scan is already `pending` or `running`.

---

## Environment variables

Document all vars. Full list in `.env.example`.

```bash
# apps/web
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server only, never exposed to client
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
REDIS_URL=                          # redis://...
SCANNER_API_URL=                    # Internal URL of scanner service
SCANNER_INTERNAL_KEY=               # Shared secret for web→scanner auth
RESEND_API_KEY=

# apps/scanner
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=
SCANNER_INTERNAL_KEY=               # Must match web app value
NUCLEI_TEMPLATES_PATH=              # Path to community templates
MAX_CONCURRENT_SCANS=5              # Rate limit on concurrent jobs
```

---

## Development workflow

```bash
# Start all services locally
docker-compose up                   # Redis
cd apps/web && npm run dev          # Next.js on :3000
cd apps/scanner && uvicorn api.main:app --reload --port 8000
cd apps/scanner && celery -A queue.worker worker --loglevel=info

# Run Supabase locally
npx supabase start                  # Requires Supabase CLI
npx supabase db reset               # Apply migrations + seed

# Type check
cd apps/web && npm run type-check
cd apps/scanner && mypy .

# Test
cd apps/web && npm test
cd apps/scanner && pytest
```

---

## What we are building next

Current state: HTML/CSS design reference files exist in `/design/` for all screens. These are the source of truth for UI.

Build order:
1. Supabase schema + migrations
2. Next.js auth flow (sign up, sign in, middleware)
3. Landing page (convert from HTML reference)
4. Dashboard shell + URL card components
5. Scanner service skeleton (FastAPI + Celery + health endpoint)
6. Passive scan (headers, SSL, DNS — no CLI tools needed)
7. Ownership verification (DNS TXT check)
8. Active scan integration (Nuclei first, then others)
9. Report page + PDF generation
10. Stripe billing + plan enforcement
11. Badge system + public report
12. Integrations (Vercel webhook, GitHub OAuth)

When working on a feature, read the corresponding HTML reference file in `/design/` first before writing any component code.
Worth adding to the CLAUDE.md too — just a note that Superpowers is installed and the brainstorming → plan → subagent flow should be used for any new feature work.





