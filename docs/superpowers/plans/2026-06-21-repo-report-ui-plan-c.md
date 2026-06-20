# Repo Report UI (GitHub Plan C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two pages that surface GitHub committed-secret scans — `/repos` (connected repos + Scan now) and `/repos/[repoId]` (Clean / N-secrets report) — plus the `ScanRepoButton` polling island and supporting wiring.

**Architecture:** Approach A — both pages are Next.js server components that fetch via the Supabase server client (RLS scopes every query to the owner), exactly like the existing `app/(app)/report/[scanId]/page.tsx`. Interactivity (trigger + poll) lives in a small `'use client'` island (`ScanRepoButton`) that POSTs `/api/repo-scans`, polls `GET /api/repo-scans?id=`, and calls `router.refresh()` on a terminal status. No backend, schema, or scanner changes — `POST`/`GET /api/repo-scans` (built in Plan B) is the only API consumed.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase server client, vitest (+ jsdom + `@testing-library/react` for client islands), `react-dom/server` `renderToStaticMarkup` for server-component render tests.

**Spec:** `docs/superpowers/specs/2026-06-21-repo-report-ui-plan-c-design.md`

## Global Constraints

- **`apps/web` only.** No scanner, API-route, migration, or schema changes. The only backend consumed is `POST`/`GET /api/repo-scans` (already built).
- **No A–F grade for repos.** Report status is **Clean** vs **N secrets exposed** (parent spec §5).
- **Only redacted fields are ever shown** — `rule_id`, `match_preview` (already masked), `file_path`, `commit_sha`, `commit_author`, `committed_at`, `line_start`, `remediation`. The schema stores no raw secret.
- **Exact headline copy:** `Clean` / `{n} secrets exposed` (singular `1 secret exposed`).
- **Exact mode-label copy:** `Full history` / `Incremental — {N} new commits since {date}` (singular `1 new commit`).
- **Status-pill states (exact labels):** `Never scanned`, `Scanning…`, `Clean`, `{n} secret(s)`, `Failed`.
- **Polling:** `GET /api/repo-scans?id=<id>` every 3000ms; on `completed`/`failed` stop and call `router.refresh()`. POST returns `202` (new) or `409` (already running, body has `repo_scan_id`); both enter the polling state. Any other status → inline error.
- **Reuse the design system.** Use existing CSS vars + existing classes (`app-main`, `topline`, `greeting`, `greeting-sub`, `section-label`, `report-top`, `report-title`, `report-meta`, `back-link`, `btn btn-primary`, `btn btn-soft`, the `6px 6px 0 var(--ink)` card shadow). No new global CSS file; page-local styling via inline styles like the existing report page.
- **Nav:** add `'repos'` to the `AppShell` `activeNav` union and a "Repos" sidebar entry under "Reports".
- **Test conventions:** client components → first line `// @vitest-environment jsdom`, `import '@testing-library/jest-dom/vitest'`, `@testing-library/react`. Server components → `renderToStaticMarkup(await Page(props))` in the default node env, `vi.mock('@/lib/supabase/server', …)`. `renderToStaticMarkup` HTML-encodes apostrophes (`'` → `&#x27;`), so assert apostrophe-free substrings.

---

### Task 1: `ScanRepoButton` client island

**Files:**
- Create: `apps/web/components/repos/ScanRepoButton.tsx`
- Test: `apps/web/components/repos/ScanRepoButton.test.tsx`

**Interfaces:**
- Consumes: `POST /api/repo-scans` (`{ repo_id }` → `202 { repo_scan_id }` | `409 { repo_scan_id }` | other) and `GET /api/repo-scans?id=<id>` (`{ status }`).
- Produces: `default export function ScanRepoButton({ repoId, activeScanId }: { repoId: string; activeScanId?: string })` — a client component. When `activeScanId` is set, it renders the disabled "Scanning…" state and polls immediately.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/repos/ScanRepoButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import ScanRepoButton from './ScanRepoButton'

beforeEach(() => { refreshMock.mockClear() })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('ScanRepoButton', () => {
  it('starts a scan and shows the scanning state on 202', async () => {
    const fetchMock = vi.fn(async () => ({ status: 202, json: async () => ({ repo_scan_id: 's1' }) }))
    vi.stubGlobal('fetch', fetchMock as any)

    render(<ScanRepoButton repoId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /scan now/i }))

    expect(await screen.findByRole('button', { name: /scanning/i })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith('/api/repo-scans', expect.objectContaining({ method: 'POST' }))
  })

  it('resumes polling on 409 and refreshes when the scan completes', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 409, json: async () => ({ repo_scan_id: 's9' }) }) // POST
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'completed' }) })        // GET poll
    vi.stubGlobal('fetch', fetchMock as any)

    render(<ScanRepoButton repoId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /scan now/i }))

    await vi.advanceTimersByTimeAsync(0)     // flush the POST
    await vi.advanceTimersByTimeAsync(3000)  // first poll → completed

    expect(fetchMock).toHaveBeenCalledWith('/api/repo-scans?id=s9')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('polls immediately when an in-flight scan id is provided', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'running' }) }))
    vi.stubGlobal('fetch', fetchMock as any)

    render(<ScanRepoButton repoId="r1" activeScanId="s5" />)
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled()

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledWith('/api/repo-scans?id=s5')
  })

  it('shows an inline error when the scan cannot be started', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 502, json: async () => ({}) })) as any)
    render(<ScanRepoButton repoId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /scan now/i }))
    expect(await screen.findByText(/start scan/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run components/repos/ScanRepoButton.test.tsx`
Expected: FAIL — cannot resolve `./ScanRepoButton`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/repos/ScanRepoButton.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  repoId: string
  activeScanId?: string
}

type Phase = 'idle' | 'scanning' | 'error'

export default function ScanRepoButton({ repoId, activeScanId }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>(activeScanId ? 'scanning' : 'idle')
  const [scanId, setScanId] = useState<string | null>(activeScanId ?? null)

  useEffect(() => {
    if (phase !== 'scanning' || !scanId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/repo-scans?id=${scanId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval)
          setPhase('idle')
          router.refresh()
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [phase, scanId, router])

  async function start() {
    setPhase('scanning')
    try {
      const res = await fetch('/api/repo-scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 202 || res.status === 409) {
        setScanId(data.repo_scan_id ?? null)
      } else {
        setPhase('error')
      }
    } catch {
      setPhase('error')
    }
  }

  if (phase === 'scanning') {
    return (
      <button className="btn btn-soft" disabled style={{ padding: '8px 14px', fontSize: 13 }}>
        Scanning…
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <button className="btn btn-primary" onClick={start} style={{ padding: '8px 14px', fontSize: 13 }}>
        Scan now
      </button>
      {phase === 'error' && (
        <span style={{ color: 'var(--danger)', fontSize: 12 }}>Couldn&rsquo;t start scan — try again</span>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run components/repos/ScanRepoButton.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/repos/ScanRepoButton.tsx apps/web/components/repos/ScanRepoButton.test.tsx
git commit -m "feat(web): ScanRepoButton — trigger + poll repo scans (Plan C)"
```

---

### Task 2: `/repos` list page (+ `RepoStatusPill`, AppShell nav)

**Files:**
- Create: `apps/web/components/repos/RepoStatusPill.tsx`
- Create: `apps/web/components/repos/RepoStatusPill.test.tsx`
- Create: `apps/web/app/(app)/repos/page.tsx`
- Create: `apps/web/app/(app)/repos/page.test.tsx`
- Modify: `apps/web/components/shared/AppShell.tsx`

**Interfaces:**
- Consumes: `ScanRepoButton` from Task 1 (`{ repoId, activeScanId? }`).
- Produces: `RepoStatusPill` — `default export function RepoStatusPill({ scan }: { scan: { status: 'pending'|'running'|'completed'|'failed'; secrets_found: number | null } | null })`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test for `RepoStatusPill`**

Create `apps/web/components/repos/RepoStatusPill.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RepoStatusPill from './RepoStatusPill'

describe('RepoStatusPill', () => {
  it('shows Never scanned when there is no scan', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={null} />)).toContain('Never scanned')
  })
  it('shows Scanning for an in-flight scan', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'running', secrets_found: null }} />)).toContain('Scanning')
  })
  it('shows Clean when completed with zero secrets', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'completed', secrets_found: 0 }} />)).toContain('Clean')
  })
  it('shows the secret count when completed with secrets', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'completed', secrets_found: 3 }} />)).toContain('3 secrets')
  })
  it('uses the singular for one secret', () => {
    const html = renderToStaticMarkup(<RepoStatusPill scan={{ status: 'completed', secrets_found: 1 }} />)
    expect(html).toContain('1 secret')
    expect(html).not.toContain('1 secrets')
  })
  it('shows Failed for a failed scan', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'failed', secrets_found: null }} />)).toContain('Failed')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run components/repos/RepoStatusPill.test.tsx`
Expected: FAIL — cannot resolve `./RepoStatusPill`.

- [ ] **Step 3: Implement `RepoStatusPill`**

Create `apps/web/components/repos/RepoStatusPill.tsx`:

```tsx
interface ScanLite {
  status: 'pending' | 'running' | 'completed' | 'failed'
  secrets_found: number | null
}

const PILL_BASE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--line)',
  whiteSpace: 'nowrap',
}

export default function RepoStatusPill({ scan }: { scan: ScanLite | null }) {
  if (!scan) {
    return <span style={{ ...PILL_BASE, color: 'var(--ink-mute)' }}>Never scanned</span>
  }
  if (scan.status === 'pending' || scan.status === 'running') {
    return <span style={{ ...PILL_BASE, color: 'var(--violet)', borderColor: 'var(--violet)' }}>Scanning…</span>
  }
  if (scan.status === 'failed') {
    return <span style={{ ...PILL_BASE, color: 'var(--danger)', borderColor: 'var(--danger)' }}>Failed</span>
  }
  const n = scan.secrets_found ?? 0
  if (n === 0) {
    return <span style={{ ...PILL_BASE, color: 'var(--lime-deep)', borderColor: 'var(--lime-deep)' }}>Clean</span>
  }
  return (
    <span style={{ ...PILL_BASE, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
      {n} secret{n === 1 ? '' : 's'}
    </span>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run components/repos/RepoStatusPill.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the AppShell nav entry**

In `apps/web/components/shared/AppShell.tsx`, extend the `activeNav` union (line ~10) to include `'repos'`:

```tsx
  activeNav?: 'dashboard' | 'urls' | 'reports' | 'repos' | 'badge' | 'integrations' | 'billing' | 'settings'
```

And add a nav link immediately after the existing "Reports" `<Link>` (the one rendering `<span className="nav-ico">▤</span> Reports`, whose `activeNav === 'reports'`) and before the "Badge" `<Link>`:

```tsx
          <Link href="/repos" className={activeNav === 'repos' ? 'active' : ''}>
            <span className="nav-ico">❮❯</span> Repos
          </Link>
```

- [ ] **Step 6: Write the failing test for the list page**

Create `apps/web/app/(app)/repos/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state: any = {}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => state.client }))
vi.mock('@/components/shared/AppShell', () => ({ default: ({ children }: any) => <div>{children}</div> }))
vi.mock('@/components/repos/ScanRepoButton', () => ({ default: () => <button>Scan now</button> }))
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import ReposPage from './page'

function makeClient(installation: any, repos: any[] = [], scans: any[] = []) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => {
      if (t === 'github_installations') return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: installation }) }) }) }),
      }
      if (t === 'repos') return {
        select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ data: repos }) }) }) }),
      }
      if (t === 'repo_scans') return {
        select: () => ({ eq: () => ({ order: () => ({ data: scans }) }) }),
      }
      throw new Error('unexpected table ' + t)
    },
  }
}

beforeEach(() => { state.client = null })

describe('/repos list page', () => {
  it('shows a Connect CTA when GitHub is not connected', async () => {
    state.client = makeClient(null)
    const html = renderToStaticMarkup(await ReposPage())
    expect(html).toContain('Connect GitHub')
    expect(html).toContain('/api/integrations/github/install')
  })

  it('shows a manage-access state when connected with no repos', async () => {
    state.client = makeClient({ installation_id: 1, account_login: 'me', status: 'active' }, [])
    const html = renderToStaticMarkup(await ReposPage())
    expect(html).toContain('No repositories selected')
  })

  it('renders a row per repo with the status pill from its latest scan', async () => {
    state.client = makeClient(
      { installation_id: 1, account_login: 'me', status: 'active' },
      [{ id: 'r1', full_name: 'me/app', last_scan_at: null }],
      [{ id: 's1', repo_id: 'r1', status: 'completed', mode: 'full', secrets_found: 0, created_at: '2026-06-21T00:00:00Z' }],
    )
    const html = renderToStaticMarkup(await ReposPage())
    expect(html).toContain('me/app')
    expect(html).toContain('Clean')
    expect(html).toContain('/repos/r1')
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd apps/web && npx vitest run repos/page.test` (vitest treats the positional arg as a filename substring filter — avoid the literal `(app)` path, whose parens are regex metacharacters)
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 8: Implement the list page**

Create `apps/web/app/(app)/repos/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import RepoStatusPill from '@/components/repos/RepoStatusPill'
import ScanRepoButton from '@/components/repos/ScanRepoButton'
import { createServerClient } from '@/lib/supabase/server'
import '../app.css'

interface RepoScanLite {
  id: string
  repo_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  mode: 'full' | 'incremental'
  secrets_found: number | null
  created_at: string
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const EMPTY_CARD: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1.5px solid var(--line)',
  borderRadius: 'var(--radius)',
  boxShadow: '6px 6px 0 var(--ink)',
  padding: '40px 32px',
  textAlign: 'center',
  maxWidth: 520,
}

export default async function ReposPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: installation } = await supabase
    .from('github_installations')
    .select('installation_id, account_login, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!installation) {
    return (
      <AppShell activeNav="repos">
        <main className="app-main">
          <div className="topline">
            <div>
              <h1 className="greeting">Repositories</h1>
              <div className="greeting-sub">scan your git history for committed secrets</div>
            </div>
          </div>
          <div style={EMPTY_CARD}>
            <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>Connect GitHub to scan your repositories</h2>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Connect GitHub to check your repositories&rsquo; git history for committed secrets — API keys, .env values, and tokens.
            </p>
            <a className="btn btn-primary" href="/api/integrations/github/install" style={{ padding: '10px 20px' }}>Connect GitHub</a>
          </div>
        </main>
      </AppShell>
    )
  }

  const { data: repos } = await supabase
    .from('repos')
    .select('id, full_name, last_scan_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('full_name')

  const { data: scans } = await supabase
    .from('repo_scans')
    .select('id, repo_id, status, mode, secrets_found, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const latestByRepo = new Map<string, RepoScanLite>()
  for (const s of (scans ?? []) as RepoScanLite[]) {
    if (!latestByRepo.has(s.repo_id)) latestByRepo.set(s.repo_id, s)
  }
  const repoList = repos ?? []

  return (
    <AppShell activeNav="repos">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Repositories</h1>
            <div className="greeting-sub">connected via github.com/{installation.account_login}</div>
          </div>
        </div>

        {repoList.length === 0 ? (
          <div style={EMPTY_CARD}>
            <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>No repositories selected</h2>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Choose which repositories Vibe-Check can scan from your GitHub settings.
            </p>
            <a className="btn btn-soft" href="/api/integrations/github/install" style={{ padding: '10px 20px' }}>Manage access</a>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {repoList.map(repo => {
              const latest = latestByRepo.get(repo.id) ?? null
              const inflight = latest && (latest.status === 'pending' || latest.status === 'running') ? latest.id : undefined
              return (
                <div key={repo.id} style={{
                  background: 'var(--bg-card)', border: '1.5px solid var(--line)',
                  borderRadius: 'var(--radius)', padding: '18px 22px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Link href={`/repos/${repo.id}`} style={{ fontWeight: 600, fontSize: 15 }}>{repo.full_name}</Link>
                      <RepoStatusPill scan={latest} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
                      last scan {formatRelative(repo.last_scan_at)}
                      {latest && ` · ${latest.mode === 'full' ? 'full history' : 'incremental'}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Link href={`/repos/${repo.id}`} className="btn btn-soft" style={{ padding: '8px 14px', fontSize: 13 }}>View report</Link>
                    <ScanRepoButton repoId={repo.id} activeScanId={inflight} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AppShell>
  )
}
```

- [ ] **Step 9: Run the list-page test and the full web suite**

Run: `cd apps/web && npx vitest run repos/page.test RepoStatusPill`
Expected: PASS (3 + 6 tests).

Run: `cd apps/web && npm run type-check`
Expected: clean (confirms the `activeNav="repos"` union change compiles).

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/repos/RepoStatusPill.tsx apps/web/components/repos/RepoStatusPill.test.tsx \
        "apps/web/app/(app)/repos/page.tsx" "apps/web/app/(app)/repos/page.test.tsx" \
        apps/web/components/shared/AppShell.tsx
git commit -m "feat(web): /repos list page + RepoStatusPill + nav entry (Plan C)"
```

---

### Task 3: `/repos/[repoId]` report page

**Files:**
- Create: `apps/web/app/(app)/repos/[repoId]/page.tsx`
- Create: `apps/web/app/(app)/repos/[repoId]/page.test.tsx`

**Interfaces:**
- Consumes: `ScanRepoButton` (`{ repoId, activeScanId? }`) and `RepoStatusPill` from Tasks 1–2.
- Produces: `default export async function RepoReportPage({ params }: { params: { repoId: string } })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(app)/repos/[repoId]/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state: any = {}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => state.client }))
vi.mock('@/components/shared/AppShell', () => ({ default: ({ children }: any) => <div>{children}</div> }))
vi.mock('@/components/repos/ScanRepoButton', () => ({ default: () => <button>Scan now</button> }))
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import RepoReportPage from './page'

function makeClient({ repo, scans = [], findings = [] }: any) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => {
      if (t === 'repos') return {
        select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: repo }) }) }) }),
      }
      if (t === 'repo_scans') return {
        select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ data: scans }) }) }) }),
      }
      if (t === 'repo_findings') return {
        select: () => ({ eq: () => ({ eq: () => ({ data: findings }) }) }),
      }
      throw new Error('unexpected table ' + t)
    },
  }
}

const REPO = { id: 'r1', full_name: 'me/app', status: 'active', installation_id: 'i1' }
beforeEach(() => { state.client = null })

describe('/repos/[repoId] report page', () => {
  it('notFound when the repo does not belong to the user', async () => {
    state.client = makeClient({ repo: null })
    await expect(RepoReportPage({ params: { repoId: 'r1' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows the Clean headline when the latest completed scan found zero secrets', async () => {
    state.client = makeClient({
      repo: REPO,
      scans: [{ id: 's1', status: 'completed', mode: 'full', commits_scanned: 120, secrets_found: 0, started_at: null, completed_at: '2026-06-21T00:00:00Z', created_at: '2026-06-21T00:00:00Z', error: null }],
    })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('Clean')
    expect(html).toContain('Full history')
  })

  it('shows the exposed headline and grouped findings when secrets are found', async () => {
    state.client = makeClient({
      repo: REPO,
      scans: [{ id: 's2', status: 'completed', mode: 'incremental', commits_scanned: 4, secrets_found: 2, started_at: null, completed_at: '2026-06-21T00:00:00Z', created_at: '2026-06-21T00:00:00Z', error: null }],
      findings: [
        { id: 'f1', rule_id: 'stripe-access-token', severity: 'critical', title: 'Stripe secret key', description: null, file_path: 'src/x.ts', commit_sha: 'abcdef1234', line_start: 12, match_preview: 'sk_live_abc…7f9x', commit_author: 'me', committed_at: '2026-06-01T00:00:00Z', remediation: 'Rotate it.' },
        { id: 'f2', rule_id: 'generic-api-key', severity: 'medium', title: 'Generic API key', description: null, file_path: '.env', commit_sha: 'beef0001', line_start: 3, match_preview: 'AKIA…', commit_author: null, committed_at: null, remediation: 'Remove it.' },
      ],
    })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('2 secrets exposed')
    expect(html).toContain('Incremental')
    expect(html).toContain('Stripe secret key')
    expect(html).toContain('Generic API key')
    expect(html).toContain('Critical')
    expect(html).toContain('Medium')
  })

  it('shows a failed panel when the latest scan failed and none completed', async () => {
    state.client = makeClient({
      repo: REPO,
      scans: [{ id: 's3', status: 'failed', mode: 'full', commits_scanned: null, secrets_found: null, started_at: null, completed_at: null, created_at: '2026-06-21T00:00:00Z', error: 'boom' }],
    })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('Scan failed')
  })

  it('shows an empty state when the repo has never been scanned', async () => {
    state.client = makeClient({ repo: REPO, scans: [] })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('been scanned')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run repoId/page.test` (substring filter — avoids the `[repoId]` brackets, which are regex metacharacters)
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Implement the report page**

Create `apps/web/app/(app)/repos/[repoId]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import ScanRepoButton from '@/components/repos/ScanRepoButton'
import { createServerClient } from '@/lib/supabase/server'
import '../../app.css'

interface Props { params: { repoId: string } }

interface RepoScan {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  mode: 'full' | 'incremental'
  commits_scanned: number | null
  secrets_found: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  error: string | null
}

interface RepoFinding {
  id: string
  rule_id: string
  severity: 'critical' | 'medium' | 'low' | 'info'
  title: string
  description: string | null
  file_path: string | null
  commit_sha: string | null
  line_start: number | null
  match_preview: string | null
  commit_author: string | null
  committed_at: string | null
  remediation: string | null
}

const SEV_ORDER: RepoFinding['severity'][] = ['critical', 'medium', 'low', 'info']
const SEV_LABEL: Record<RepoFinding['severity'], string> = { critical: 'Critical', medium: 'Medium', low: 'Low', info: 'Info' }
const SEV_COLOR: Record<RepoFinding['severity'], string> = { critical: 'var(--danger)', medium: 'var(--warn)', low: 'var(--ink-mute)', info: 'var(--ink-mute)' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const PANEL: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1.5px solid var(--line)',
  borderRadius: 'var(--radius)', padding: '28px 32px', marginBottom: 24,
}

export default async function RepoReportPage({ params }: Props) {
  if (!params.repoId) notFound()

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: repo } = await supabase
    .from('repos')
    .select('id, full_name, status, installation_id')
    .eq('id', params.repoId)
    .eq('user_id', user.id)
    .single()

  if (!repo || repo.status !== 'active') notFound()

  const { data: scans } = await supabase
    .from('repo_scans')
    .select('id, status, mode, commits_scanned, secrets_found, started_at, completed_at, created_at, error')
    .eq('repo_id', params.repoId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const history = (scans ?? []) as RepoScan[]
  const latest = history[0] ?? null
  const completed = history.filter(s => s.status === 'completed')
  const latestCompleted = completed[0] ?? null
  const prevCompleted = completed[1] ?? null
  const inflight = latest && (latest.status === 'pending' || latest.status === 'running') ? latest.id : undefined

  const { data: findingsData } = latestCompleted
    ? await supabase
        .from('repo_findings')
        .select('id, rule_id, severity, title, description, file_path, commit_sha, line_start, match_preview, commit_author, committed_at, remediation')
        .eq('repo_scan_id', latestCompleted.id)
        .eq('user_id', user.id)
    : { data: [] }

  const findings = (findingsData ?? []) as RepoFinding[]
  const secretsFound = latestCompleted?.secrets_found ?? 0

  return (
    <AppShell activeNav="repos">
      <main className="app-main">
        <Link href="/repos" className="back-link">← back to repositories</Link>

        <div className="report-top">
          <div>
            <h1 className="report-title">{repo.full_name}</h1>
            <div className="report-meta">
              {latest && <span>last scan <b>{formatDate(latest.created_at)}</b></span>}
            </div>
          </div>
          <ScanRepoButton repoId={repo.id} activeScanId={inflight} />
        </div>

        {!latest && (
          <div style={PANEL}>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
              This repository hasn&rsquo;t been scanned yet. Run a scan to check its git history for committed secrets.
            </p>
          </div>
        )}

        {latest && (latest.status === 'pending' || latest.status === 'running') && !latestCompleted && (
          <div style={PANEL}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)' }}>Scanning…</h2>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Checking the full git history — this usually takes under a minute.</p>
          </div>
        )}

        {latest && latest.status === 'failed' && !latestCompleted && (
          <div style={{ ...PANEL, background: '#fef2f2', border: '1.5px solid var(--danger)' }}>
            <h2 style={{ color: 'var(--danger)', margin: '0 0 8px' }}>Scan failed</h2>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>This scan could not complete. Please run it again.</p>
          </div>
        )}

        {latestCompleted && (
          <>
            {secretsFound === 0 ? (
              <div style={{ ...PANEL, border: '1.5px solid var(--lime-deep)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, color: 'var(--lime-deep)' }}>Clean</div>
                <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)' }}>
                  No committed secrets found in {latestCompleted.mode === 'full' ? 'the full git history' : 'the scanned commits'}.
                </p>
              </div>
            ) : (
              <div style={{ ...PANEL, border: '1.5px solid var(--danger)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: 'var(--danger)' }}>
                  {secretsFound} secret{secretsFound === 1 ? '' : 's'} exposed
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {SEV_ORDER.map(sev => {
                    const c = findings.filter(f => f.severity === sev).length
                    return c > 0 ? <span key={sev} style={{ color: SEV_COLOR[sev] }}><b>{c}</b> {SEV_LABEL[sev].toLowerCase()}</span> : null
                  })}
                </div>
              </div>
            )}

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginBottom: 24 }}>
              {latestCompleted.mode === 'full'
                ? 'Full history'
                : `Incremental — ${latestCompleted.commits_scanned ?? 0} new commit${latestCompleted.commits_scanned === 1 ? '' : 's'}${prevCompleted ? ` since ${formatDate(prevCompleted.completed_at)}` : ''}`}
            </div>

            {findings.length > 0 && SEV_ORDER.map(sev => {
              const group = findings.filter(f => f.severity === sev)
              if (group.length === 0) return null
              return (
                <div key={sev}>
                  <h2 className="section-label" style={{ color: SEV_COLOR[sev] }}>{SEV_LABEL[sev]} ({group.length})</h2>
                  {group.map(f => (
                    <div key={f.id} style={{ background: 'var(--bg-card)', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 12 }}>
                      <div style={{ fontWeight: 600 }}>
                        {f.title}{' '}
                        <span style={{ color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.rule_id}</span>
                      </div>
                      {f.match_preview && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, margin: '8px 0', color: 'var(--ink-soft)' }}>{f.match_preview}</div>
                      )}
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
                        {f.file_path}{f.line_start != null ? `:${f.line_start}` : ''}
                        {f.commit_sha ? ` · ${f.commit_sha.slice(0, 7)}` : ''}
                        {f.commit_author ? ` · ${f.commit_author}` : ''}
                        {f.committed_at ? ` · ${formatDate(f.committed_at)}` : ''}
                      </div>
                      {f.remediation && (
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>{f.remediation}</div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}

        {history.length > 0 && (
          <>
            <h2 className="section-label" style={{ marginTop: 36 }}>Scan history</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  <th style={{ padding: '8px 0' }}>Date</th>
                  <th>Mode</th>
                  <th>Commits</th>
                  <th>Secrets</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 0' }}>{formatDate(s.created_at)}</td>
                    <td>{s.mode}</td>
                    <td>{s.commits_scanned ?? '—'}</td>
                    <td>{s.secrets_found ?? '—'}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
    </AppShell>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run repoId/page.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/repos/[repoId]/page.tsx" "apps/web/app/(app)/repos/[repoId]/page.test.tsx"
git commit -m "feat(web): /repos/[repoId] committed-secret report page (Plan C)"
```

---

### Task 4: Wire the GitHub card into `/repos`

**Files:**
- Modify: `apps/web/components/integrations/GitHubCard.tsx`
- Modify: `apps/web/components/integrations/GitHubCard.test.tsx`

**Interfaces:**
- Consumes: nothing new. Produces the same `GitHubCard` default export with repo names linking to `/repos/[repoId]` and a "View repos →" link to `/repos`.

- [ ] **Step 1: Add the failing test**

In `apps/web/components/integrations/GitHubCard.test.tsx`, add this test inside the `describe('GitHubCard', …)` block:

```tsx
  it('links each repo to its report and offers a view-repos link', () => {
    render(
      <GitHubCard
        installation={{ installation_id: 5, account_login: 'me', status: 'active' }}
        repos={[{ id: 'r1', full_name: 'me/app', status: 'active' }]}
      />,
    )
    expect(screen.getByRole('link', { name: 'me/app' })).toHaveAttribute('href', '/repos/r1')
    expect(screen.getByRole('link', { name: /view repos/i })).toHaveAttribute('href', '/repos')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run components/integrations/GitHubCard.test.tsx`
Expected: FAIL — the repo renders as a `<span>` (no link role / href), and there is no "View repos" link.

- [ ] **Step 3: Implement the changes**

In `apps/web/components/integrations/GitHubCard.tsx`, change the repo list mapping (currently `repos.filter(r => r.status === 'active').map(r => <span key={r.id}>{r.full_name}</span>)`) to render links:

```tsx
                  {repos.filter(r => r.status === 'active').map(r => (
                    <a key={r.id} href={`/repos/${r.id}`}>{r.full_name}</a>
                  ))}
```

And in the connected `int-actions` block, add a "View repos" link as the first action (before "Manage access"):

```tsx
            <a className="btn btn-soft" href="/repos" style={{ padding: '8px 12px', fontSize: 13 }}>View repos →</a>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run components/integrations/GitHubCard.test.tsx`
Expected: PASS (3 tests — the existing two plus the new one; `getByText('me/app')` still matches the link text).

- [ ] **Step 5: Run the full suite + build**

Run: `cd apps/web && npx vitest run`
Expected: PASS — all prior tests plus the new repo tests.

Run: `cd apps/web && npm run build`
Expected: build succeeds (the new routes compile).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/integrations/GitHubCard.tsx apps/web/components/integrations/GitHubCard.test.tsx
git commit -m "feat(web): link the GitHub integration card into /repos (Plan C)"
```

---

## Post-implementation

After all tasks are complete and the full web suite + build are green, update `PROJECT_STATUS.md`:
- Mark **Plan C (report UI)** under "Integrations — in progress" as shipped (`/repos` + `/repos/[repoId]` live; Scan now + polling; honest empty/not-connected states).
- Note the next step in the GitHub line is **Vercel deploy webhooks**.

(The two deploy-time prerequisites already tracked in memory — set the `GITHUB_*` env vars + point `vibe-check-app.com` at the deployed app — remain required before any of this is exercisable in production, but are not part of this plan's code.)
