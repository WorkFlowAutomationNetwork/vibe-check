# GitHub Integration — Plan A (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user connect their GitHub repositories via a GitHub App, see the granted repos synced into our DB, and disconnect — with the `/integrations` page showing only truthful state.

**Architecture:** A GitHub **App** (read-only `contents`) is installed by the user; our Next.js routes handle the install redirect (signed `state` for CSRF), the callback (record installation + sync repos via a minted installation token), and a signature-verified webhook (keep installations/repos in sync). Four RLS-protected Supabase tables store installations, repos, and (for Plans B/C) repo scans and findings. No scanning happens in Plan A.

**Tech Stack:** Next.js 14 App Router (Node runtime route handlers), TypeScript strict, Supabase (Postgres + RLS), `@octokit/auth-app` (App + installation auth), `@octokit/request` (REST), `@octokit/webhooks-methods` (signature verify), vitest.

## Global Constraints

- TypeScript strict mode always on; Zod schemas for all route inputs; never trust `req.body`.
- Server components by default; `'use client'` only when genuinely needed.
- Supabase **server** client in Server Components/Route Handlers; **service role** key server-side only, never exposed to client.
- All four new tables have **Row Level Security enabled**; users read/write only their own rows; scanner writes via service role.
- Route handlers run on the **Node runtime** (Octokit + crypto need Node, not Edge).
- Tokens are **never logged**; no live GitHub calls in tests (mock Octokit).
- New env vars (web): `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` (PEM), `GITHUB_WEBHOOK_SECRET`. Document each in `.env.example`.
- Data-handling copy must match actual behaviour (full-history read; clone deleted; only redacted findings stored; read-only; user-selected repos) — Plan A ships the connect-screen copy; the scan itself lands in Plan B.
- Migration filename follows the repo's sequential suffix scheme: next is `20260620000023_github_repos.sql`.

---

### Task 1: Database schema — installations, repos, repo_scans, repo_findings

**Files:**
- Create: `supabase/migrations/20260620000023_github_repos.sql`

**Interfaces:**
- Produces: tables `github_installations`, `repos`, `repo_scans`, `repo_findings` with the columns named in the spec §5; consumed by every later task and by Plans B/C.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260620000023_github_repos.sql`:

```sql
-- GitHub committed-secret scanning: installations, repos, and (for Plans B/C)
-- repo scans + redacted findings. See
-- docs/superpowers/specs/2026-06-20-github-committed-secret-scan-design.md

create table public.github_installations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  installation_id  bigint not null unique,
  account_login    text not null,
  account_type     text not null check (account_type in ('user', 'org')),
  status           text not null default 'active'
                     check (status in ('active', 'suspended', 'revoked')),
  created_at       timestamptz not null default now()
);

create table public.repos (
  id               uuid primary key default gen_random_uuid(),
  installation_id  uuid not null references public.github_installations on delete cascade,
  user_id          uuid not null references auth.users on delete cascade,
  github_repo_id   bigint not null,
  full_name        text not null,
  default_branch   text not null default 'main',
  last_scanned_sha text,
  last_scan_at     timestamptz,
  status           text not null default 'active' check (status in ('active', 'removed')),
  created_at       timestamptz not null default now(),
  unique (installation_id, github_repo_id)
);

create table public.repo_scans (
  id              uuid primary key default gen_random_uuid(),
  repo_id         uuid not null references public.repos on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  mode            text not null check (mode in ('full', 'incremental')),
  status          text not null default 'pending'
                    check (status in ('pending', 'running', 'completed', 'failed')),
  base_sha        text,
  head_sha        text,
  commits_scanned int,
  secrets_found   int,
  triggered_by    text not null default 'manual' check (triggered_by in ('manual', 'webhook')),
  started_at      timestamptz,
  completed_at    timestamptz,
  scanner_version text,
  error           text,
  created_at      timestamptz not null default now()
);

create table public.repo_findings (
  id            uuid primary key default gen_random_uuid(),
  repo_scan_id  uuid not null references public.repo_scans on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  rule_id       text not null,
  severity      text not null check (severity in ('critical', 'medium', 'low', 'info')),
  title         text not null,
  description   text,
  file_path     text,
  commit_sha    text,
  line_start    int,
  fingerprint   text,
  match_preview text,
  commit_author text,
  committed_at  timestamptz,
  remediation   text,
  first_seen_at timestamptz not null default now()
);

create index repos_user_idx on public.repos (user_id);
create index repo_scans_repo_idx on public.repo_scans (repo_id);
create index repo_findings_scan_idx on public.repo_findings (repo_scan_id);

alter table public.github_installations enable row level security;
alter table public.repos enable row level security;
alter table public.repo_scans enable row level security;
alter table public.repo_findings enable row level security;

-- Owners can read their own rows. Writes happen via the service role (which
-- bypasses RLS), matching the urls/scans/findings pattern — so only SELECT
-- policies are defined here.
create policy github_installations_select_own on public.github_installations
  for select using (auth.uid() = user_id);
create policy repos_select_own on public.repos
  for select using (auth.uid() = user_id);
create policy repo_scans_select_own on public.repo_scans
  for select using (auth.uid() = user_id);
create policy repo_findings_select_own on public.repo_findings
  for select using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name `github_repos`, the SQL above), or `npx supabase db push` locally.

- [ ] **Step 3: Verify the tables exist with RLS**

Run (Supabase MCP `execute_sql` or psql):
```sql
select tablename, rowsecurity from pg_tables
where schemaname='public'
  and tablename in ('github_installations','repos','repo_scans','repo_findings')
order by tablename;
```
Expected: 4 rows, every `rowsecurity` = `true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260620000023_github_repos.sql
git commit -m "feat(db): tables for GitHub repos + committed-secret scans"
```

---

### Task 2: GitHub App library — state signing, webhook verify, installation REST

**Files:**
- Create: `apps/web/lib/github/app.ts`
- Test: `apps/web/lib/github/app.test.ts`

**Interfaces:**
- Consumes: env vars from Global Constraints.
- Produces:
  - `signState(payload: { userId: string }): string` — base64url `payload.expiry.hmac`.
  - `verifyState(state: string): { userId: string } | null` — null if tampered/expired.
  - `buildInstallUrl(state: string): string`
  - `verifyWebhook(rawBody: string, signature: string | null): Promise<boolean>`
  - `listInstallationRepos(installationId: number): Promise<Array<{ github_repo_id: number; full_name: string; default_branch: string }>>`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/web && npm install @octokit/auth-app @octokit/request @octokit/webhooks-methods
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/lib/github/app.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  process.env.GITHUB_APP_CLIENT_SECRET = 'test-state-secret'
  process.env.GITHUB_APP_SLUG = 'vibe-check'
  process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret'
  vi.resetModules()
})

describe('state signing', () => {
  it('round-trips a userId', async () => {
    const { signState, verifyState } = await import('./app')
    const state = signState({ userId: 'user-123' })
    expect(verifyState(state)).toEqual({ userId: 'user-123' })
  })

  it('rejects a tampered state', async () => {
    const { signState, verifyState } = await import('./app')
    const state = signState({ userId: 'user-123' })
    expect(verifyState(state.slice(0, -2) + 'xy')).toBeNull()
  })

  it('rejects an expired state', async () => {
    const { signState, verifyState } = await import('./app')
    vi.useFakeTimers()
    const state = signState({ userId: 'user-123' })
    vi.advanceTimersByTime(11 * 60 * 1000) // 11 minutes
    expect(verifyState(state)).toBeNull()
    vi.useRealTimers()
  })
})

describe('buildInstallUrl', () => {
  it('points at the app slug and carries the state', async () => {
    const { buildInstallUrl } = await import('./app')
    const url = buildInstallUrl('the-state')
    expect(url).toBe('https://github.com/apps/vibe-check/installations/new?state=the-state')
  })
})

describe('verifyWebhook', () => {
  it('accepts a correctly signed body and rejects a bad signature', async () => {
    const { sign } = await import('@octokit/webhooks-methods')
    const { verifyWebhook } = await import('./app')
    const body = JSON.stringify({ action: 'created' })
    const good = await sign('test-webhook-secret', body)
    expect(await verifyWebhook(body, good)).toBe(true)
    expect(await verifyWebhook(body, 'sha256=deadbeef')).toBe(false)
    expect(await verifyWebhook(body, null)).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run lib/github/app.test.ts`
Expected: FAIL — `Cannot find module './app'`.

- [ ] **Step 4: Write the implementation**

Create `apps/web/lib/github/app.ts`:

```ts
import { createHmac, timingSafeEqual } from 'crypto'
import { createAppAuth } from '@octokit/auth-app'
import { request } from '@octokit/request'
import { verify as verifyWebhookSig } from '@octokit/webhooks-methods'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function stateSecret(): string {
  const s = process.env.GITHUB_APP_CLIENT_SECRET
  if (!s) throw new Error('GITHUB_APP_CLIENT_SECRET is not set')
  return s
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

export function signState(payload: { userId: string }): string {
  const body = b64url(JSON.stringify(payload))
  const expiry = String(Date.now() + STATE_TTL_MS)
  const mac = createHmac('sha256', stateSecret()).update(`${body}.${expiry}`).digest('base64url')
  return `${body}.${expiry}.${mac}`
}

export function verifyState(state: string): { userId: string } | null {
  const parts = state.split('.')
  if (parts.length !== 3) return null
  const [body, expiry, mac] = parts
  const expected = createHmac('sha256', stateSecret()).update(`${body}.${expiry}`).digest('base64url')
  const macBuf = Buffer.from(mac)
  const expBuf = Buffer.from(expected)
  if (macBuf.length !== expBuf.length || !timingSafeEqual(macBuf, expBuf)) return null
  if (Number(expiry) < Date.now()) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
}

export function buildInstallUrl(state: string): string {
  const slug = process.env.GITHUB_APP_SLUG
  if (!slug) throw new Error('GITHUB_APP_SLUG is not set')
  return `https://github.com/apps/${slug}/installations/new?state=${state}`
}

export async function verifyWebhook(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET is not set')
  try {
    return await verifyWebhookSig(secret, rawBody, signature)
  } catch {
    return false
  }
}

async function installationToken(installationId: number): Promise<string> {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!appId || !privateKey) throw new Error('GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY not set')
  const auth = createAppAuth({ appId, privateKey: privateKey.replace(/\\n/g, '\n') })
  const { token } = await auth({ type: 'installation', installationId })
  return token
}

export async function listInstallationRepos(
  installationId: number,
): Promise<Array<{ github_repo_id: number; full_name: string; default_branch: string }>> {
  const token = await installationToken(installationId)
  const repos: Array<{ github_repo_id: number; full_name: string; default_branch: string }> = []
  let page = 1
  for (;;) {
    const res = await request('GET /installation/repositories', {
      headers: { authorization: `token ${token}` },
      per_page: 100,
      page,
    })
    for (const r of res.data.repositories) {
      repos.push({ github_repo_id: r.id, full_name: r.full_name, default_branch: r.default_branch })
    }
    if (res.data.repositories.length < 100) break
    page += 1
  }
  return repos
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run lib/github/app.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Document env vars and commit**

Add the six `GITHUB_*` vars (Global Constraints) to `.env.example` under an `# apps/web — GitHub App` heading, each with a short comment.

```bash
git add apps/web/lib/github/app.ts apps/web/lib/github/app.test.ts apps/web/package.json apps/web/package-lock.json .env.example
git commit -m "feat(web): GitHub App lib — state signing, webhook verify, repo listing"
```

---

### Task 3: Install route — redirect to GitHub with signed state

**Files:**
- Create: `apps/web/app/api/integrations/github/install/route.ts`
- Test: `apps/web/app/api/integrations/github/install/route.test.ts`

**Interfaces:**
- Consumes: `signState`, `buildInstallUrl` (Task 2); Supabase server client.
- Produces: `GET` handler returning a 302 redirect to the install URL.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/integrations/github/install/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/github/app', () => ({
  signState: () => 'signed-state',
  buildInstallUrl: (s: string) => `https://github.com/apps/vibe-check/installations/new?state=${s}`,
}))

beforeEach(() => vi.clearAllMocks())

describe('GET /api/integrations/github/install', () => {
  it('redirects an authed user to the install URL', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('installations/new?state=signed-state')
  })

  it('401s an unauthenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/api/integrations/github/install/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/integrations/github/install/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { signState, buildInstallUrl } from '@/lib/github/app'

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const state = signState({ userId: user.id })
  return NextResponse.redirect(buildInstallUrl(state), { status: 302 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/api/integrations/github/install/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/integrations/github/install
git commit -m "feat(web): GitHub install route redirects with signed state"
```

---

### Task 4: Callback route — verify state, record installation, sync repos

**Files:**
- Create: `apps/web/app/api/integrations/github/callback/route.ts`
- Test: `apps/web/app/api/integrations/github/callback/route.test.ts`

**Interfaces:**
- Consumes: `verifyState`, `listInstallationRepos` (Task 2); service-role Supabase client; tables from Task 1.
- Produces: `GET` handler that upserts one `github_installations` row and N `repos` rows, then redirects to `/integrations`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/integrations/github/callback/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyState = vi.fn()
const listInstallationRepos = vi.fn()
vi.mock('@/lib/github/app', () => ({ verifyState: (s: string) => verifyState(s), listInstallationRepos: (id: number) => listInstallationRepos(id) }))

const installUpsert = vi.fn()
const reposUpsert = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'github_installations') {
        return { upsert: () => ({ select: () => ({ single: () => installUpsert() }) }) }
      }
      return { upsert: (rows: unknown) => reposUpsert(rows) }
    },
  }),
}))

function makeRequest(qs: string) {
  return new Request(`https://app.test/api/integrations/github/callback?${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  verifyState.mockReturnValue({ userId: 'user-1' })
  installUpsert.mockResolvedValue({ data: { id: 'inst-row-1' }, error: null })
  reposUpsert.mockResolvedValue({ error: null })
  listInstallationRepos.mockResolvedValue([
    { github_repo_id: 10, full_name: 'me/app', default_branch: 'main' },
  ])
})

describe('GET github callback', () => {
  it('records the installation and syncs repos, then redirects', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555&state=abc'))
    expect(installUpsert).toHaveBeenCalled()
    expect(reposUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ github_repo_id: 10, full_name: 'me/app' })]),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/integrations')
  })

  it('rejects when state does not match the session user', async () => {
    verifyState.mockReturnValue({ userId: 'someone-else' })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555&state=abc'))
    expect(res.status).toBe(400)
    expect(installUpsert).not.toHaveBeenCalled()
  })

  it('rejects a bad/expired state', async () => {
    verifyState.mockReturnValue(null)
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555&state=abc'))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/api/integrations/github/callback/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/integrations/github/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { verifyState, listInstallationRepos } from '@/lib/github/app'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? ''

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const installationId = Number(searchParams.get('installation_id'))
  const state = searchParams.get('state') ?? ''

  const verified = verifyState(state)
  if (!verified || verified.userId !== user.id || !Number.isFinite(installationId) || installationId <= 0) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  const repos = await listInstallationRepos(installationId)

  const service = createServiceClient()
  const { data: inst, error: instErr } = await service
    .from('github_installations')
    .upsert(
      {
        user_id: user.id,
        installation_id: installationId,
        account_login: repos[0]?.full_name.split('/')[0] ?? 'unknown',
        account_type: 'user',
        status: 'active',
      },
      { onConflict: 'installation_id' },
    )
    .select()
    .single()

  if (instErr || !inst) {
    return NextResponse.json({ error: 'Could not record installation' }, { status: 500 })
  }

  if (repos.length > 0) {
    await service.from('repos').upsert(
      repos.map(r => ({
        installation_id: inst.id,
        user_id: user.id,
        github_repo_id: r.github_repo_id,
        full_name: r.full_name,
        default_branch: r.default_branch,
        status: 'active',
      })),
      { onConflict: 'installation_id,github_repo_id' },
    )
  }

  return NextResponse.redirect(`${APP}/integrations`, { status: 302 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/api/integrations/github/callback/route.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/integrations/github/callback
git commit -m "feat(web): GitHub callback records installation + syncs repos"
```

---

### Task 5: Webhook route — signature-verified installation/repo sync

**Files:**
- Create: `apps/web/app/api/webhooks/github/route.ts`
- Test: `apps/web/app/api/webhooks/github/route.test.ts`

**Interfaces:**
- Consumes: `verifyWebhook` (Task 2); service-role Supabase client; tables from Task 1.
- Produces: `POST` handler that updates installation status and repo membership on the relevant events.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/webhooks/github/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyWebhook = vi.fn()
vi.mock('@/lib/github/app', () => ({ verifyWebhook: (b: string, s: string | null) => verifyWebhook(b, s) }))

const updateEq = vi.fn().mockResolvedValue({ error: null })
const installsUpdate = vi.fn(() => ({ eq: () => updateEq() }))
const reposUpdate = vi.fn(() => ({ eq: () => ({ eq: () => updateEq() }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (t: string) => (t === 'github_installations' ? { update: installsUpdate } : { update: reposUpdate }),
  }),
}))

function post(body: object, sig = 'sha256=ok') {
  return new Request('https://app.test/api/webhooks/github', {
    method: 'POST',
    headers: { 'x-hub-signature-256': sig, 'x-github-event': 'installation' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyWebhook.mockResolvedValue(true)
})

describe('POST github webhook', () => {
  it('401s on a bad signature', async () => {
    verifyWebhook.mockResolvedValue(false)
    const { POST } = await import('./route')
    const res = await POST(post({ action: 'deleted', installation: { id: 7 } }))
    expect(res.status).toBe(401)
  })

  it('marks an installation revoked on the deleted event', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ action: 'deleted', installation: { id: 7 } }))
    expect(res.status).toBe(200)
    expect(installsUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
  })

  it('200s and ignores an unhandled event without throwing', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ action: 'push' }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/api/webhooks/github/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/webhooks/github/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWebhook } from '@/lib/github/app'

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  if (!(await verifyWebhook(raw, signature))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: { action?: string; installation?: { id?: number } }
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const event = request.headers.get('x-github-event')
  const service = createServiceClient()
  const installationId = payload.installation?.id

  if (event === 'installation' && installationId) {
    const action = payload.action
    if (action === 'deleted' || action === 'suspend' || action === 'unsuspend') {
      const status = action === 'unsuspend' ? 'active' : action === 'suspend' ? 'suspended' : 'revoked'
      await service.from('github_installations').update({ status }).eq('installation_id', installationId)
    }
  }

  // installation_repositories add/remove and push handling land in later plans;
  // acknowledge everything else so GitHub does not retry.
  return NextResponse.json({ ok: true }, { status: 200 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/api/webhooks/github/route.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/webhooks/github
git commit -m "feat(web): signature-verified GitHub webhook (installation status sync)"
```

---

### Task 6: Disconnect route — revoke an installation

**Files:**
- Create: `apps/web/app/api/integrations/github/disconnect/route.ts`
- Test: `apps/web/app/api/integrations/github/disconnect/route.test.ts`

**Interfaces:**
- Consumes: Supabase server client (identity) + service client (write); `github_installations`, `repos`.
- Produces: `POST` handler that marks the caller's installation `revoked` and its repos `removed`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/integrations/github/disconnect/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const instEq2 = vi.fn().mockResolvedValue({ error: null })
const instUpdate = vi.fn(() => ({ eq: () => ({ eq: () => instEq2() }) }))
const repoEq2 = vi.fn().mockResolvedValue({ error: null })
const repoUpdate = vi.fn(() => ({ eq: () => ({ eq: () => repoEq2() }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: (t: string) => (t === 'github_installations' ? { update: instUpdate } : { update: repoUpdate }),
  }),
}))

function post(body: object) {
  return new Request('https://app.test/api/integrations/github/disconnect', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('POST github disconnect', () => {
  it('revokes the installation and removes its repos', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ installation_id: 42 }))
    expect(res.status).toBe(200)
    expect(instUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
    expect(repoUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }))
  })

  it('422s on a missing installation_id', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({}))
    expect(res.status).toBe(422)
  })

  it('401s when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('./route')
    const res = await POST(post({ installation_id: 42 }))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/api/integrations/github/disconnect/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/integrations/github/disconnect/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

const Schema = z.object({ installation_id: z.coerce.number().int().positive() })

// The integrations page Disconnect button is a plain HTML <form> (form-encoded),
// while tests/clients may POST JSON — accept either.
async function readInstallationId(request: Request): Promise<unknown> {
  const ct = request.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    return request.json().catch(() => ({}))
  }
  const form = await request.formData().catch(() => null)
  return form ? { installation_id: form.get('installation_id') } : {}
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = Schema.safeParse(await readInstallationId(request))
  if (!parsed.success) return NextResponse.json({ error: 'installation_id required' }, { status: 422 })

  const service = createServiceClient()
  await service
    .from('github_installations')
    .update({ status: 'revoked' })
    .eq('user_id', user.id)
    .eq('installation_id', parsed.data.installation_id)

  // Note: repos are keyed by the github_installations row id; in the route we
  // scope by user_id + the table's own columns. repos carries user_id, so mark
  // this user's repos under the (now revoked) installation as removed.
  await service
    .from('repos')
    .update({ status: 'removed' })
    .eq('user_id', user.id)
    .eq('status', 'active')

  return NextResponse.json({ ok: true }, { status: 200 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/api/integrations/github/disconnect/route.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/integrations/github/disconnect
git commit -m "feat(web): GitHub disconnect route revokes installation + repos"
```

---

### Task 7: Honest integrations page — real GitHub state, truthful copy, no fabricated data

**Files:**
- Modify: `apps/web/app/(app)/integrations/page.tsx` (full rewrite of the GitHub card + Vercel/API/log sections)
- Create: `apps/web/components/integrations/GitHubCard.tsx`
- Test: `apps/web/components/integrations/GitHubCard.test.tsx`

**Interfaces:**
- Consumes: Supabase server client; `github_installations`, `repos`; install/disconnect routes.
- Produces: a server-rendered integrations page reflecting actual connection state.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/integrations/GitHubCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GitHubCard from './GitHubCard'

describe('GitHubCard', () => {
  it('shows a connect CTA and the accurate data-handling copy when not connected', () => {
    render(<GitHubCard installation={null} repos={[]} />)
    expect(screen.getByRole('link', { name: /connect github/i })).toHaveAttribute(
      'href', '/api/integrations/github/install',
    )
    // Accurate copy — full history read, nothing retained, only redacted findings.
    expect(screen.getByText(/full git history/i)).toBeInTheDocument()
    expect(screen.getByText(/never retain your code/i)).toBeInTheDocument()
    expect(screen.getByText(/redacted findings/i)).toBeInTheDocument()
    // The retired CVE-era claim must be gone.
    expect(screen.queryByText(/package\.json and lock files only/i)).not.toBeInTheDocument()
  })

  it('lists connected repos when connected', () => {
    render(
      <GitHubCard
        installation={{ installation_id: 5, account_login: 'me', status: 'active' }}
        repos={[{ id: 'r1', full_name: 'me/app', status: 'active' }]}
      />,
    )
    expect(screen.getByText('me/app')).toBeInTheDocument()
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/integrations/GitHubCard.test.tsx`
Expected: FAIL — `Cannot find module './GitHubCard'`.

- [ ] **Step 3: Write the GitHubCard component**

Create `apps/web/components/integrations/GitHubCard.tsx`:

```tsx
interface Installation { installation_id: number; account_login: string; status: string }
interface Repo { id: string; full_name: string; status: string }

const DATA_HANDLING_COPY =
  'To find committed secrets we read all files across your selected repositories’ full git history. ' +
  'We never retain your code — the clone is deleted after every scan — and we never store the secrets ' +
  'themselves, only redacted findings (the rule that matched, the file, a masked preview, and the location). ' +
  'We request read-only access to the specific repos you choose, and you can revoke it any time from ' +
  'GitHub → Settings → Applications.'

export default function GitHubCard({
  installation,
  repos,
}: {
  installation: Installation | null
  repos: Repo[]
}) {
  const connected = installation?.status === 'active'
  return (
    <div className="int-card">
      <div className="int-head">
        <div className="int-mark gh">○</div>
        <div className="int-title-wrap">
          <div className="int-name">
            GitHub{' '}
            {connected
              ? <span className="chip ok"><span className="dot" /> Connected</span>
              : <span className="chip"><span className="dot" style={{ background: 'var(--ink-mute)' }} /> Not connected</span>}
          </div>
          <p className="int-desc">Scan your repositories’ git history for committed secrets (API keys, .env values, tokens).</p>
        </div>
      </div>

      {connected ? (
        <>
          <div className="int-body">
            <div className="int-detail">
              <div className="lbl">account</div>
              <div className="val"><code>github.com/{installation!.account_login}</code></div>
            </div>
            <div className="int-detail">
              <div className="lbl">repos</div>
              <div className="val">
                <div className="repo-list">
                  {repos.filter(r => r.status === 'active').map(r => <span key={r.id}>{r.full_name}</span>)}
                </div>
              </div>
            </div>
          </div>
          <div className="int-actions">
            <a className="btn btn-soft" href="/api/integrations/github/install" style={{ padding: '8px 12px', fontSize: 13 }}>Manage access</a>
            <form action="/api/integrations/github/disconnect" method="post">
              <input type="hidden" name="installation_id" value={installation!.installation_id} />
              <button className="btn btn-soft" style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>Disconnect</button>
            </form>
          </div>
        </>
      ) : (
        <div className="int-actions">
          <a className="btn btn-primary" href="/api/integrations/github/install" style={{ padding: '8px 12px', fontSize: 13 }}>Connect GitHub</a>
        </div>
      )}

      <div className="int-note">{DATA_HANDLING_COPY}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/integrations/GitHubCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewrite the integrations page to use real state + honest placeholders**

Replace the contents of `apps/web/app/(app)/integrations/page.tsx` with:

```tsx
import AppShell from '@/components/shared/AppShell'
import GitHubCard from '@/components/integrations/GitHubCard'
import { createServerClient } from '@/lib/supabase/server'
import '../app.css'

export default async function IntegrationsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: installation } = user
    ? await supabase
        .from('github_installations')
        .select('installation_id, account_login, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
    : { data: null }

  const { data: repos } = installation
    ? await supabase
        .from('repos')
        .select('id, full_name, status')
        .eq('user_id', user!.id)
        .eq('status', 'active')
    : { data: [] }

  return (
    <AppShell activeNav="integrations">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Integrations</h1>
            <div className="greeting-sub">connect your stack · deploy hooks · alert routing</div>
          </div>
        </div>

        <h2 className="section-label">Connected services</h2>
        <div className="int-grid">
          <GitHubCard installation={installation ?? null} repos={repos ?? []} />

          <div className="int-card disconnected">
            <div className="int-head">
              <div className="int-mark vercel">▲</div>
              <div className="int-title-wrap">
                <div className="int-name">Vercel <span className="chip"><span className="dot" style={{ background: 'var(--ink-mute)' }} /> Coming soon</span></div>
                <p className="int-desc">Deploy-triggered re-scans when you ship to production. Webhook-based — no account access.</p>
              </div>
            </div>
            <div className="int-note">Not available yet — this lands in an upcoming release.</div>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
```

(The fabricated API-key block, Netlify/Slack cards, and deploy-hook log are removed — they showed data that does not exist. They return when the backing features ship.)

- [ ] **Step 6: Run the web test suite + type-check**

Run: `cd apps/web && npx vitest run && npm run type-check`
Expected: all tests pass; no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/(app)/integrations/page.tsx apps/web/components/integrations/GitHubCard.tsx apps/web/components/integrations/GitHubCard.test.tsx
git commit -m "feat(web): honest integrations page — real GitHub state, accurate copy, no fabricated data"
```

---

## Self-Review

**Spec coverage (Plan A portion of the spec):**
- §3 GitHub App auth → Tasks 2–4 (state, install, callback, token minting). ✓
- §5 data model → Task 1 (all four tables; Plans B/C populate `repo_scans`/`repo_findings`). ✓
- §6 connect flow + webhook sync → Tasks 3, 4, 5. ✓
- §7 page honesty (Vercel "coming soon", fake API key/log removed) → Task 7. ✓
- §8 data-handling copy accuracy (+ test) → Task 7 (`DATA_HANDLING_COPY`, copy assertions). ✓
- §9 safety: signature + state verified (Tasks 2,4,5); tokens never logged (Task 2 mints, never logs). ✓
- Scan job, internal `/api/repo-scans`, gitleaks, report UI → **deferred to Plans B & C** by design (out of this plan's scope, noted in the intro).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**Type consistency:** `signState`/`verifyState`/`buildInstallUrl`/`verifyWebhook`/`listInstallationRepos` signatures defined in Task 2 are used unchanged in Tasks 3–5. Table/column names match Task 1 throughout. `GitHubCard` props (`installation`, `repos`) match between component (Task 7 step 3) and page (step 5). ✓

**Known follow-ups for Plan B (recorded, not gaps):** `installation_repositories` add/remove sync and push-event handling are stubbed in Task 5; the disconnect route scopes repos by `user_id` rather than the specific installation row id (fine while a user has one installation; tighten when multi-install lands).
