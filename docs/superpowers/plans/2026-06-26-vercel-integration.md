# Vercel Deploy-Hook Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vercel Deploy Hook integration so Monitor-plan users get an automatic active re-scan whenever they deploy to production.

**Architecture:** Generate a per-user secret token, embed it in a webhook URL the user pastes into Vercel's Deploy Hooks settings. Vercel POSTs to that URL on every deploy; Vibe-Check verifies the token via a SHA-256 hash lookup in the `integrations` table and dispatches active re-scans on all the user's `monitoring_mode=continuous` URLs.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (service-role client), Node.js `crypto`, Vitest + Testing Library.

## Global Constraints

- TypeScript strict mode — no `any`, no unchecked nulls
- Supabase service-role client for all DB writes in API routes; server client only to get the authenticated user
- `integrations.status` CHECK constraint values: `'active' | 'disconnected' | 'pending'` — never `'revoked'`
- `webhook_log.status` CHECK constraint values: `'SCAN_QUEUED' | 'SCAN_DONE' | 'IGNORED'`
- Webhook receiver always returns `200` — never a 4xx/5xx to Vercel (except `401` for invalid token)
- Raw token never stored in DB — SHA-256 hex digest only (same pattern as `api_keys`)
- Follow existing test patterns: `vi.mock` + module re-import; jsdom env for component tests
- No new npm packages — use Node.js built-in `crypto` only

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260626000026_integrations_unique.sql` | **Create** | Add `UNIQUE(user_id, type)` to `integrations` |
| `apps/web/lib/vercel-webhook.ts` | **Create** | `generateWebhookToken` + `hashToken` helpers |
| `apps/web/lib/vercel-webhook.test.ts` | **Create** | Unit tests for helpers |
| `apps/web/app/api/integrations/vercel/route.ts` | **Create** | `POST` (generate/regenerate) + `DELETE` (disconnect) |
| `apps/web/app/api/integrations/vercel/route.test.ts` | **Create** | Route handler tests |
| `apps/web/app/api/webhooks/vercel/[token]/route.ts` | **Create** | Webhook receiver — verify token, dispatch scans |
| `apps/web/app/api/webhooks/vercel/[token]/route.test.ts` | **Create** | Receiver tests |
| `apps/web/components/integrations/VercelCard.tsx` | **Create** | Client component — connected/disconnected UI |
| `apps/web/components/integrations/VercelCard.test.tsx` | **Create** | Component tests |
| `apps/web/app/(app)/integrations/page.tsx` | **Modify** | Fetch vercel integration, render `VercelCard` |

---

## Task 1: DB Migration — integrations unique constraint

**Files:**
- Create: `supabase/migrations/20260626000026_integrations_unique.sql`

**Interfaces:**
- Produces: `UNIQUE(user_id, type)` constraint on `integrations`, enabling safe upsert in Task 3

- [ ] **Step 1: Write the migration**

```sql
-- Enforce one integration row per user per type so upserts are safe.
alter table public.integrations
  add constraint integrations_user_type_unique unique (user_id, type);
```

Save to `supabase/migrations/20260626000026_integrations_unique.sql`.

- [ ] **Step 2: Apply locally**

```bash
npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Apply to production**

```bash
npx supabase db push --linked
```

Expected: `20260626000026_integrations_unique` listed as applied.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260626000026_integrations_unique.sql
git commit -m "feat(db): add unique constraint on integrations(user_id, type)"
```

---

## Task 2: Token helpers

**Files:**
- Create: `apps/web/lib/vercel-webhook.ts`
- Create: `apps/web/lib/vercel-webhook.test.ts`

**Interfaces:**
- Produces:
  - `generateWebhookToken(): string` — 64-char hex, cryptographically random
  - `hashToken(token: string): string` — SHA-256 hex digest, deterministic

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/vercel-webhook.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateWebhookToken, hashToken } from './vercel-webhook'

describe('generateWebhookToken', () => {
  it('returns a 64-character hex string', () => {
    expect(generateWebhookToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a unique value each call', () => {
    expect(generateWebhookToken()).not.toBe(generateWebhookToken())
  })
})

describe('hashToken', () => {
  it('returns a 64-character hex string', () => {
    expect(hashToken('test-token')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashToken('test-token')).toBe(hashToken('test-token'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('xyz'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run lib/vercel-webhook.test.ts
```

Expected: FAIL — `Cannot find module './vercel-webhook'`

- [ ] **Step 3: Implement the helpers**

Create `apps/web/lib/vercel-webhook.ts`:

```ts
import { randomBytes, createHash } from 'crypto'

export function generateWebhookToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/vercel-webhook.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/vercel-webhook.ts apps/web/lib/vercel-webhook.test.ts
git commit -m "feat(web): add vercel webhook token helpers"
```

---

## Task 3: Integration management API

**Files:**
- Create: `apps/web/app/api/integrations/vercel/route.ts`
- Create: `apps/web/app/api/integrations/vercel/route.test.ts`

**Interfaces:**
- Consumes: `generateWebhookToken(): string`, `hashToken(token: string): string` from `@/lib/vercel-webhook`
- Produces:
  - `POST /api/integrations/vercel` → `{ webhookUrl: string }` (auth required)
  - `DELETE /api/integrations/vercel` → `{ ok: true }` (auth required)

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/integrations/vercel/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: (table: string) => ({
      upsert: mockUpsert,
      update: () => ({ eq: () => ({ eq: mockUpdateEq }) }),
    }),
  }),
}))

vi.mock('@/lib/vercel-webhook', () => ({
  generateWebhookToken: () => 'a'.repeat(64),
  hashToken: (t: string) => 'hashed_' + t,
}))

function makeRequest(method: string) {
  return new Request('https://app.test/api/integrations/vercel', {
    method,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/integrations/vercel', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('./route')
    const res = await POST(makeRequest('POST'))
    expect(res.status).toBe(401)
  })

  it('upserts an integrations row and returns a webhookUrl', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { POST } = await import('./route')
    const res = await POST(makeRequest('POST'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.webhookUrl).toContain('/api/webhooks/vercel/' + 'a'.repeat(64))
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        type: 'vercel',
        status: 'active',
        config: expect.objectContaining({ token_hash: 'hashed_' + 'a'.repeat(64) }),
      }),
      expect.objectContaining({ onConflict: 'user_id,type' }),
    )
  })
})

describe('DELETE /api/integrations/vercel', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { DELETE } = await import('./route')
    const res = await DELETE(makeRequest('DELETE'))
    expect(res.status).toBe(401)
  })

  it('sets integration status to disconnected and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { DELETE } = await import('./route')
    const res = await DELETE(makeRequest('DELETE'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(mockUpdateEq).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run app/api/integrations/vercel/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/integrations/vercel/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { generateWebhookToken, hashToken } from '@/lib/vercel-webhook'

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = generateWebhookToken()
  const tokenHash = hashToken(token)

  const service = createServiceClient()
  const { error } = await service
    .from('integrations')
    .upsert(
      {
        user_id: user.id,
        type: 'vercel',
        status: 'active',
        config: { token_hash: tokenHash, created_at: new Date().toISOString() },
      },
      { onConflict: 'user_id,type' },
    )

  if (error) return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 })

  const origin = new URL(request.url).origin
  const webhookUrl = `${origin}/api/webhooks/vercel/${token}`
  return NextResponse.json({ webhookUrl })
}

export async function DELETE(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service
    .from('integrations')
    .update({ status: 'disconnected' })
    .eq('user_id', user.id)
    .eq('type', 'vercel')

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run app/api/integrations/vercel/route.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/integrations/vercel/route.ts apps/web/app/api/integrations/vercel/route.test.ts
git commit -m "feat(web): add vercel integration management API"
```

---

## Task 4: Webhook receiver

**Files:**
- Create: `apps/web/app/api/webhooks/vercel/[token]/route.ts`
- Create: `apps/web/app/api/webhooks/vercel/[token]/route.test.ts`

**Interfaces:**
- Consumes: `hashToken(token: string): string` from `@/lib/vercel-webhook`
- Produces: `POST /api/webhooks/vercel/[token]` → `{ queued: number }` always `200`, or `401` for bad token

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/webhooks/vercel/[token]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/vercel-webhook', () => ({
  hashToken: (t: string) => 'hashed_' + t,
}))

// Track mock calls for assertions
const mockDispatch = vi.fn().mockResolvedValue(true)

// Supabase chain mocks — rebuilt per test via mockFrom
let mockFrom: ReturnType<typeof vi.fn>

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// Mock fetch for scanner dispatch
vi.stubGlobal('fetch', mockDispatch)

function makeRequest(token: string, body: object = {}) {
  return {
    request: new Request(`https://app.test/api/webhooks/vercel/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: { token },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/webhooks/vercel/[token]', () => {
  it('returns 401 for an unknown token', async () => {
    mockFrom = vi.fn(() => ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
    }))
    const { POST } = await import('./route')
    const { request, params } = makeRequest('bad-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(401)
  })

  it('returns 200 with queued:0 when user has no eligible URLs', async () => {
    // Integration found, but no URLs
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [] }) }) }) }) }) }
      return {}
    })
    const { POST } = await import('./route')
    const { request, params } = makeRequest('valid-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 0 })
  })

  it('returns 200 with queued:0 when all URLs already have an active scan', async () => {
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [{ id: 'url-1' }] }) }) }) }) }) }
      if (table === 'scans') {
        return { select: () => ({ eq: () => ({ in: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'existing-scan' } }) }) }) }) }
      }
      return {}
    })
    const { POST } = await import('./route')
    const { request, params } = makeRequest('valid-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 0 })
  })

  it('queues a scan and returns queued:1 for an eligible URL', async () => {
    mockDispatch.mockResolvedValue({ ok: true })
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [{ id: 'url-1' }] }) }) }) }) }) }
      if (table === 'scans') {
        return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new-scan' } }) }) }),
        }
      }
      return {}
    })
    const { POST } = await import('./route')
    const { request, params } = makeRequest('valid-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 1 })
  })

  it('returns 200 even when the request body is malformed JSON', async () => {
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [] }) }) }) }) }) }
      return {}
    })
    const { POST } = await import('./route')
    const badRequest = new Request('https://app.test/api/webhooks/vercel/valid-token', {
      method: 'POST',
      body: 'not json at all',
    })
    const res = await POST(badRequest, { params: { token: 'valid-token' } })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run "app/api/webhooks/vercel/\[token\]/route.test.ts"
```

Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the receiver**

Create `apps/web/app/api/webhooks/vercel/[token]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/vercel-webhook'

async function dispatchToScanner(payload: {
  scan_id: string
  url_id: string
  scan_type: string
  user_id: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.SCANNER_API_URL}/api/scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': process.env.SCANNER_INTERNAL_KEY ?? '',
      },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } },
) {
  const tokenHash = hashToken(params.token)
  const supabase = createServiceClient()

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, user_id')
    .eq('type', 'vercel')
    .eq('status', 'active')
    .eq('config->>token_hash', tokenHash)
    .maybeSingle()

  if (!integration) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  let rawBody: unknown = null
  try { rawBody = await request.json() } catch { /* ignore — just a trigger */ }

  await supabase
    .from('integrations')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', integration.id)

  await supabase
    .from('webhook_log')
    .insert({
      integration_id: integration.id,
      source: 'vercel',
      payload: rawBody ?? {},
      status: 'SCAN_QUEUED',
    })

  const { data: urls } = await supabase
    .from('urls')
    .select('id')
    .eq('user_id', integration.user_id)
    .eq('verified', true)
    .eq('monitoring_mode', 'continuous')
    .is('deleted_at', null)

  if (!urls?.length) {
    return NextResponse.json({ queued: 0 })
  }

  let queued = 0
  for (const url of urls) {
    const { data: active } = await supabase
      .from('scans')
      .select('id')
      .eq('url_id', url.id)
      .in('status', ['pending', 'running'])
      .maybeSingle()

    if (active) continue

    const { data: scan } = await supabase
      .from('scans')
      .insert({
        url_id: url.id,
        user_id: integration.user_id,
        scan_type: 'active',
        status: 'pending',
        triggered_by: 'webhook',
      })
      .select('id')
      .single()

    if (scan) {
      const dispatched = await dispatchToScanner({
        scan_id: scan.id,
        url_id: url.id,
        scan_type: 'active',
        user_id: integration.user_id,
      })
      if (dispatched) queued++
    }
  }

  return NextResponse.json({ queued })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run "app/api/webhooks/vercel/\[token\]/route.test.ts"
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/webhooks/vercel/[token]/route.ts" "apps/web/app/api/webhooks/vercel/[token]/route.test.ts"
git commit -m "feat(web): add vercel webhook receiver"
```

---

## Task 5: VercelCard component

**Files:**
- Create: `apps/web/components/integrations/VercelCard.tsx`
- Create: `apps/web/components/integrations/VercelCard.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime (API calls happen in the browser)
- Produces: `default export VercelCard({ integration }: { integration: VercelIntegration | null })` where:
  ```ts
  interface VercelIntegration {
    id: string
    status: string
    last_triggered_at: string | null
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/integrations/VercelCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VercelCard from './VercelCard'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

describe('VercelCard — disconnected', () => {
  it('shows the Connect button when integration is null', () => {
    render(<VercelCard integration={null} />)
    expect(screen.getByRole('button', { name: /connect vercel/i })).toBeInTheDocument()
    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument()
  })

  it('shows the webhook URL after clicking Connect', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ webhookUrl: 'https://app.test/api/webhooks/vercel/abc123' }),
    } as Response)

    render(<VercelCard integration={null} />)
    fireEvent.click(screen.getByRole('button', { name: /connect vercel/i }))

    await waitFor(() => {
      expect(screen.getByText('https://app.test/api/webhooks/vercel/abc123')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })
})

describe('VercelCard — connected, URL unknown', () => {
  const integration = { id: 'int-1', status: 'active', last_triggered_at: null }

  it('shows connected chip and regenerate/disconnect buttons', () => {
    render(<VercelCard integration={integration} />)
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /regenerate url/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
  })

  it('shows "Regenerate to view URL again" when no URL in state', () => {
    render(<VercelCard integration={integration} />)
    expect(screen.getByText(/regenerate to view url again/i)).toBeInTheDocument()
  })

  it('shows the new URL after regenerating', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ webhookUrl: 'https://app.test/api/webhooks/vercel/newtoken' }),
    } as Response)

    render(<VercelCard integration={integration} />)
    fireEvent.click(screen.getByRole('button', { name: /regenerate url/i }))

    await waitFor(() => {
      expect(screen.getByText('https://app.test/api/webhooks/vercel/newtoken')).toBeInTheDocument()
    })
  })

  it('shows the last triggered timestamp when set', () => {
    const withTriggered = { ...integration, last_triggered_at: new Date(Date.now() - 5 * 60000).toISOString() }
    render(<VercelCard integration={withTriggered} />)
    expect(screen.getByText(/last triggered/i)).toBeInTheDocument()
    expect(screen.getByText(/5m ago/i)).toBeInTheDocument()
  })
})

describe('VercelCard — disconnect', () => {
  it('hides connected state after disconnecting', async () => {
    vi.stubGlobal('confirm', () => true)
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)

    render(<VercelCard integration={{ id: 'int-1', status: 'active', last_triggered_at: null }} />)
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect vercel/i })).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run components/integrations/VercelCard.test.tsx
```

Expected: FAIL — `Cannot find module './VercelCard'`

- [ ] **Step 3: Implement the component**

Create `apps/web/components/integrations/VercelCard.tsx`:

```tsx
'use client'

import { useState } from 'react'

interface VercelIntegration {
  id: string
  status: string
  last_triggered_at: string | null
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function VercelCard({
  integration: initialIntegration,
}: {
  integration: VercelIntegration | null
}) {
  const [integration, setIntegration] = useState(initialIntegration)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const connected = integration?.status === 'active'

  async function generate() {
    setLoading(true)
    const res = await fetch('/api/integrations/vercel', { method: 'POST' })
    const json = await res.json()
    setWebhookUrl(json.webhookUrl)
    setIntegration(i => i
      ? { ...i, status: 'active' }
      : { id: '', status: 'active', last_triggered_at: null }
    )
    setLoading(false)
  }

  async function disconnect() {
    if (!confirm('Disconnect Vercel? Vercel will no longer trigger re-scans.')) return
    await fetch('/api/integrations/vercel', { method: 'DELETE' })
    setIntegration(null)
    setWebhookUrl(null)
  }

  async function copy() {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="int-card">
      <div className="int-head">
        <div className="int-mark vercel">▲</div>
        <div className="int-title-wrap">
          <div className="int-name">
            Vercel{' '}
            {connected
              ? <span className="chip ok"><span className="dot" /> Connected</span>
              : <span className="chip"><span className="dot" style={{ background: 'var(--ink-mute)' }} /> Not connected</span>}
          </div>
          <p className="int-desc">Deploy-triggered re-scans when you ship to production. Webhook-based — no account access required.</p>
        </div>
      </div>

      {connected ? (
        <>
          <div className="int-body">
            {webhookUrl ? (
              <div className="int-detail">
                <div className="lbl">webhook url</div>
                <div className="val" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{webhookUrl}</code>
                  <button className="btn btn-soft" onClick={copy} style={{ padding: '4px 8px', fontSize: 12, flexShrink: 0 }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="int-detail">
                <div className="lbl">webhook url</div>
                <div className="val" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Regenerate to view URL again</div>
              </div>
            )}
            {integration?.last_triggered_at && (
              <div className="int-detail">
                <div className="lbl">last triggered</div>
                <div className="val">{formatRelative(integration.last_triggered_at)}</div>
              </div>
            )}
            <div className="int-note" style={{ marginTop: 8 }}>
              In Vercel: Project Settings → Git → Deploy Hooks → paste this URL.
              Every deploy triggers an active re-scan on your monitored URLs.
            </div>
          </div>
          <div className="int-actions">
            <button className="btn btn-soft" onClick={generate} disabled={loading} style={{ padding: '8px 12px', fontSize: 13 }}>
              Regenerate URL
            </button>
            <button className="btn btn-soft" onClick={disconnect} style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <div className="int-actions">
          <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ padding: '8px 12px', fontSize: 13 }}>
            {loading ? 'Connecting…' : 'Connect Vercel'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run components/integrations/VercelCard.test.tsx
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/integrations/VercelCard.tsx apps/web/components/integrations/VercelCard.test.tsx
git commit -m "feat(web): add VercelCard integration component"
```

---

## Task 6: Wire up the integrations page

**Files:**
- Modify: `apps/web/app/(app)/integrations/page.tsx`

**Interfaces:**
- Consumes: `VercelCard` from `@/components/integrations/VercelCard`
- Consumes: `VercelIntegration` shape: `{ id: string, status: string, last_triggered_at: string | null }`

- [ ] **Step 1: Update the integrations page**

Replace the contents of `apps/web/app/(app)/integrations/page.tsx` with:

```tsx
import AppShell from '@/components/shared/AppShell'
import GitHubCard from '@/components/integrations/GitHubCard'
import VercelCard from '@/components/integrations/VercelCard'
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

  const { data: vercelIntegration } = user
    ? await supabase
        .from('integrations')
        .select('id, status, last_triggered_at')
        .eq('user_id', user.id)
        .eq('type', 'vercel')
        .eq('status', 'active')
        .maybeSingle()
    : { data: null }

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
          <VercelCard integration={vercelIntegration ?? null} />
        </div>
      </main>
    </AppShell>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd apps/web && npx vitest run
```

Expected: all existing tests still pass plus the new ones from Tasks 2–5.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/integrations/page.tsx
git commit -m "feat(web): wire VercelCard into integrations page"
```

---

## Task 7: Smoke test end-to-end

No new files — manual verification only.

- [ ] **Step 1: Start dev server**

```bash
cd apps/web && npm run dev
```

- [ ] **Step 2: Sign in and navigate to `/integrations`**

Expected: Vercel card shows "Not connected" with a "Connect Vercel" button. GitHub card unchanged.

- [ ] **Step 3: Click "Connect Vercel"**

Expected: button shows "Connecting…" briefly, then the card transitions to connected state showing a full webhook URL and a "Copy" button.

- [ ] **Step 4: Copy the URL and verify format**

Expected: URL is `http://localhost:3000/api/webhooks/vercel/<64-hex-chars>`.

- [ ] **Step 5: Simulate a Vercel deploy hook**

```bash
curl -X POST "<paste-url-from-step-4>" \
  -H "Content-Type: application/json" \
  -d '{"type":"DEPLOYMENT","payload":{}}'
```

Expected: `{"queued":0}` if no `monitoring_mode=continuous` URLs exist, or `{"queued":N}` if they do.

- [ ] **Step 6: Verify in Supabase**

Check `integrations` table: one row with `type='vercel'`, `status='active'`, `last_triggered_at` updated.
Check `webhook_log` table: one row with `source='vercel'`, `status='SCAN_QUEUED'`.

- [ ] **Step 7: Click "Regenerate URL"**

Expected: new URL displayed; old URL now returns `401` when curled.

- [ ] **Step 8: Click "Disconnect"**

Expected: card returns to "Not connected" state. Row in `integrations` has `status='disconnected'`.

- [ ] **Step 9: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix(web): vercel integration smoke-test fixes"
```
