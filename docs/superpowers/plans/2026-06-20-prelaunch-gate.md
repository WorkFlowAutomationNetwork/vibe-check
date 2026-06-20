# Prelaunch Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the whole web app behind an env-toggled "coming soon" password wall with a shared password and an optional launch-notify email capture, removable at launch with one env flag.

**Architecture:** A small pure helper module (`lib/prelaunch/gate.ts`) holds all gate logic (lock toggle, path exemptions, HMAC cookie token, constant-time compare). The Next middleware (`lib/supabase/middleware.ts`) calls a single `prelaunchGate(request)` at the top of `updateSession` and rewrites unauthenticated requests to a standalone `/prelaunch` page. Two form-POST route handlers (`/api/prelaunch/unlock`, `/api/prelaunch/notify`) set the unlock cookie and capture waitlist emails. No client JS — the page is a server component that reflects state via query params.

**Tech Stack:** Next.js 14 App Router (TS strict), Web Crypto (`crypto.subtle`, Edge-safe), Zod, Supabase service-role client, vitest.

## Global Constraints

- Env vars, exact names: `PRELAUNCH_LOCK_ENABLED` (lock is active only when value is the string `'true'`); `PRELAUNCH_PASSWORD` (shared secret).
- **Fail-closed:** when the lock is enabled but `PRELAUNCH_PASSWORD` is empty/unset, the site stays locked — `verifyToken` returns false and the unlock route always rejects. Never "no password ⇒ everyone in".
- Password and token comparisons use the constant-time `constantTimeEqual` helper, never `===`.
- Cookie name is exactly `vibe_prelaunch`; value is `HMAC-SHA256('vibe-check-prelaunch-v1', key=PRELAUNCH_PASSWORD)` hex. Flags: `httpOnly`, `secure`, `sameSite='lax'`, `path='/'`, `maxAge=60*60*24*30`. Because the key is the password, rotating the password invalidates all existing cookies.
- Middleware-path crypto uses **Web Crypto only** (`crypto.subtle`) — no `node:crypto` (Edge runtime).
- Exemption allowlist, exact prefixes (matched as exact or `prefix + '/'`): `/prelaunch`, `/api/prelaunch`, `/api/billing`, `/api/webhooks`, `/api/scans`, `/api/repo-scans`, `/api/auth`, `/auth`.
- Notify endpoint returns the SAME success state for a new email and a duplicate (no enumeration); only a malformed email yields an error state.
- Waitlist writes go through the service-role client (`createServiceClient`), matching the existing urls/scans/findings pattern. RLS enabled, no public policies.
- The `/prelaunch` page uses the existing design-system CSS variables; add no new dependencies.

---

### Task 1: Gate primitives (`lib/prelaunch/gate.ts`)

**Files:**
- Create: `apps/web/lib/prelaunch/gate.ts`
- Test: `apps/web/lib/prelaunch/gate.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module; reads `process.env`).
- Produces:
  - `COOKIE_NAME: string` (= `'vibe_prelaunch'`)
  - `isLockEngaged(): boolean`
  - `getConfiguredPassword(): string`
  - `isExemptPath(pathname: string): boolean`
  - `constantTimeEqual(a: string, b: string): boolean`
  - `signToken(password: string): Promise<string>`
  - `verifyToken(token: string | undefined, password: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/prelaunch/gate.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  COOKIE_NAME, isLockEngaged, getConfiguredPassword, isExemptPath,
  constantTimeEqual, signToken, verifyToken,
} from './gate'

describe('prelaunch gate primitives', () => {
  beforeEach(() => {
    delete process.env.PRELAUNCH_LOCK_ENABLED
    delete process.env.PRELAUNCH_PASSWORD
  })

  it('exposes the fixed cookie name', () => {
    expect(COOKIE_NAME).toBe('vibe_prelaunch')
  })

  it('lock is engaged only when the flag is exactly "true"', () => {
    expect(isLockEngaged()).toBe(false)
    process.env.PRELAUNCH_LOCK_ENABLED = 'false'
    expect(isLockEngaged()).toBe(false)
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    expect(isLockEngaged()).toBe(true)
  })

  it('reads the configured password, empty when unset', () => {
    expect(getConfiguredPassword()).toBe('')
    process.env.PRELAUNCH_PASSWORD = 'hunter2'
    expect(getConfiguredPassword()).toBe('hunter2')
  })

  it('exempts the allowlisted prefixes and their subpaths, nothing else', () => {
    for (const p of ['/prelaunch', '/api/prelaunch/unlock', '/api/billing/stripe-webhook',
      '/api/webhooks/vercel', '/api/scans', '/api/repo-scans', '/api/auth/callback', '/auth/confirm']) {
      expect(isExemptPath(p)).toBe(true)
    }
    for (const p of ['/', '/dashboard', '/sign-in', '/api/badge/x', '/prelaunchx']) {
      expect(isExemptPath(p)).toBe(false)
    }
  })

  it('constantTimeEqual matches equal strings and rejects others', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })

  it('verifyToken accepts a token signed with the same password', async () => {
    const token = await signToken('s3cret')
    expect(await verifyToken(token, 's3cret')).toBe(true)
  })

  it('verifyToken rejects a token signed with a different password (rotation invalidates)', async () => {
    const token = await signToken('old-pass')
    expect(await verifyToken(token, 'new-pass')).toBe(false)
  })

  it('fails closed: empty password never verifies, even with a matching-shaped token', async () => {
    const token = await signToken('')
    expect(await verifyToken(token, '')).toBe(false)
    expect(await verifyToken(undefined, 'x')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run lib/prelaunch/gate.test.ts`
Expected: FAIL — cannot resolve `./gate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/prelaunch/gate.ts
export const COOKIE_NAME = 'vibe_prelaunch'
const TOKEN_MARKER = 'vibe-check-prelaunch-v1'

const EXEMPT_PREFIXES = [
  '/prelaunch',
  '/api/prelaunch',
  '/api/billing',
  '/api/webhooks',
  '/api/scans',
  '/api/repo-scans',
  '/api/auth',
  '/auth',
]

export function isLockEngaged(): boolean {
  return process.env.PRELAUNCH_LOCK_ENABLED === 'true'
}

export function getConfiguredPassword(): string {
  return process.env.PRELAUNCH_PASSWORD ?? ''
}

export function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// Length-independent compare. Reveals only length, which is acceptable here.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function signToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(TOKEN_MARKER))
  return toHex(sig)
}

export async function verifyToken(token: string | undefined, password: string): Promise<boolean> {
  if (!token || !password) return false
  const expected = await signToken(password)
  return constantTimeEqual(token, expected)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run lib/prelaunch/gate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/prelaunch/gate.ts apps/web/lib/prelaunch/gate.test.ts
git commit -m "feat(web): prelaunch gate primitives (lock toggle, exemptions, HMAC token)"
```

---

### Task 2: Gate decision + middleware wiring

**Files:**
- Modify: `apps/web/lib/prelaunch/gate.ts` (add `prelaunchGate`)
- Modify: `apps/web/lib/supabase/middleware.ts:4-6`
- Test: `apps/web/lib/prelaunch/gate.test.ts` (append a `prelaunchGate` describe block)

**Interfaces:**
- Consumes: `isLockEngaged`, `isExemptPath`, `verifyToken`, `getConfiguredPassword`, `COOKIE_NAME` from Task 1.
- Produces: `prelaunchGate(request: NextRequest): Promise<NextResponse | null>` — returns a rewrite-to-`/prelaunch` response when the request must be blocked, else `null` (caller proceeds).

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/prelaunch/gate.test.ts`:

```ts
import { NextRequest } from 'next/server'
import { prelaunchGate, signToken as sign } from './gate'

describe('prelaunchGate(request)', () => {
  beforeEach(() => {
    delete process.env.PRELAUNCH_LOCK_ENABLED
    delete process.env.PRELAUNCH_PASSWORD
  })

  function req(path: string, cookie?: string) {
    const r = new NextRequest(new URL(`http://localhost${path}`))
    if (cookie) r.cookies.set('vibe_prelaunch', cookie)
    return r
  }

  it('returns null when the lock is off', async () => {
    expect(await prelaunchGate(req('/dashboard'))).toBeNull()
  })

  it('rewrites to /prelaunch when locked with no cookie on a guarded path', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'pw'
    const res = await prelaunchGate(req('/dashboard'))
    expect(res).not.toBeNull()
    expect(res!.headers.get('x-middleware-rewrite')).toContain('/prelaunch')
  })

  it('returns null for exempt paths even when locked', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'pw'
    expect(await prelaunchGate(req('/api/billing/stripe-webhook'))).toBeNull()
    expect(await prelaunchGate(req('/prelaunch'))).toBeNull()
  })

  it('returns null when locked with a valid cookie', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'pw'
    const token = await sign('pw')
    expect(await prelaunchGate(req('/dashboard', token))).toBeNull()
  })

  it('rewrites when locked with a stale cookie from an old password', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'new-pw'
    const stale = await sign('old-pw')
    const res = await prelaunchGate(req('/dashboard', stale))
    expect(res!.headers.get('x-middleware-rewrite')).toContain('/prelaunch')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run lib/prelaunch/gate.test.ts`
Expected: FAIL — `prelaunchGate` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the top of `apps/web/lib/prelaunch/gate.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
```

Add at the end of `apps/web/lib/prelaunch/gate.ts`:

```ts
export async function prelaunchGate(request: NextRequest): Promise<NextResponse | null> {
  if (!isLockEngaged()) return null
  const { pathname } = request.nextUrl
  if (isExemptPath(pathname)) return null

  const token = request.cookies.get(COOKIE_NAME)?.value
  if (await verifyToken(token, getConfiguredPassword())) return null

  const url = request.nextUrl.clone()
  url.pathname = '/prelaunch'
  return NextResponse.rewrite(url)
}
```

Wire it into `apps/web/lib/supabase/middleware.ts` — replace the function opening:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'
import { prelaunchGate } from '@/lib/prelaunch/gate'

export async function updateSession(request: NextRequest) {
  const gated = await prelaunchGate(request)
  if (gated) return gated

  let supabaseResponse = NextResponse.next({ request })
  // ...rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run lib/prelaunch/gate.test.ts`
Expected: PASS (13 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/prelaunch/gate.ts apps/web/lib/prelaunch/gate.test.ts apps/web/lib/supabase/middleware.ts
git commit -m "feat(web): wire prelaunch gate into middleware (rewrite to /prelaunch)"
```

---

### Task 3: Unlock route (`/api/prelaunch/unlock`)

**Files:**
- Create: `apps/web/app/api/prelaunch/unlock/route.ts`
- Test: `apps/web/app/api/prelaunch/unlock/route.test.ts`

**Interfaces:**
- Consumes: `COOKIE_NAME`, `getConfiguredPassword`, `constantTimeEqual`, `signToken` from Task 1.
- Produces: `POST(request: Request)` — 303 redirect; sets `vibe_prelaunch` cookie on success, redirects to `/prelaunch?error=1` on failure.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/prelaunch/unlock/route.test.ts
import { describe, it, expect, beforeEach } from 'vitest'

describe('POST /api/prelaunch/unlock', () => {
  beforeEach(() => {
    process.env.PRELAUNCH_PASSWORD = 'correct-horse'
  })

  function post(password: string) {
    const body = new URLSearchParams({ password })
    return new Request('http://localhost/api/prelaunch/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  }

  it('sets the cookie and redirects home on the correct password', async () => {
    const { POST } = await import('./route')
    const res = await POST(post('correct-horse'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/')
    expect(res.headers.get('set-cookie')).toContain('vibe_prelaunch=')
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('redirects with error and sets no cookie on the wrong password', async () => {
    const { POST } = await import('./route')
    const res = await POST(post('wrong'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/prelaunch?error=1')
    expect(res.headers.get('set-cookie') ?? '').not.toContain('vibe_prelaunch=')
  })

  it('rejects every attempt when no password is configured (fail closed)', async () => {
    process.env.PRELAUNCH_PASSWORD = ''
    const { POST } = await import('./route')
    const res = await POST(post(''))
    expect(res.headers.get('location')).toContain('/prelaunch?error=1')
    expect(res.headers.get('set-cookie') ?? '').not.toContain('vibe_prelaunch=')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/api/prelaunch/unlock/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/api/prelaunch/unlock/route.ts
import { NextResponse } from 'next/server'
import { COOKIE_NAME, getConfiguredPassword, constantTimeEqual, signToken } from '@/lib/prelaunch/gate'

export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  const form = await request.formData()
  const password = String(form.get('password') ?? '')
  const configured = getConfiguredPassword()

  if (!configured || !constantTimeEqual(password, configured)) {
    return NextResponse.redirect(new URL('/prelaunch?error=1', origin), { status: 303 })
  }

  const token = await signToken(configured)
  const res = NextResponse.redirect(new URL('/', origin), { status: 303 })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/api/prelaunch/unlock/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/prelaunch/unlock/route.ts apps/web/app/api/prelaunch/unlock/route.test.ts
git commit -m "feat(web): prelaunch unlock route (constant-time check, signed cookie)"
```

---

### Task 4: Waitlist table + notify route (`/api/prelaunch/notify`)

**Files:**
- Create: `supabase/migrations/20260620000024_waitlist.sql`
- Create: `apps/web/app/api/prelaunch/notify/route.ts`
- Test: `apps/web/app/api/prelaunch/notify/route.test.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/server` (existing).
- Produces: `POST(request: Request)` — 303 redirect to `/prelaunch?notify=ok` on a valid email (new OR duplicate), `/prelaunch?notify=invalid` on a malformed email.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260620000024_waitlist.sql
-- Launch-notify capture for the prelaunch coming-soon gate.
-- See docs/superpowers/specs/2026-06-20-prelaunch-gate-design.md

create table public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text not null default 'prelaunch',
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
-- No public policies: inserts happen via the service role only, matching the
-- urls/scans/findings pattern.
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/app/api/prelaunch/notify/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: any = {}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.client,
}))

function post(email: string) {
  const body = new URLSearchParams({ email })
  return new Request('http://localhost/api/prelaunch/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

describe('POST /api/prelaunch/notify', () => {
  beforeEach(() => {
    state.client = null
    state.upserted = null
  })

  it('stores a valid email (lowercased/trimmed) and redirects to notify=ok', async () => {
    state.client = {
      from: () => ({
        upsert: (row: any) => {
          state.upserted = row
          return Promise.resolve({ error: null })
        },
      }),
    }
    const { POST } = await import('./route')
    const res = await POST(post('  Me@Example.COM '))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/prelaunch?notify=ok')
    expect(state.upserted.email).toBe('me@example.com')
    expect(state.upserted.source).toBe('prelaunch')
  })

  it('returns the same notify=ok state for a duplicate (no enumeration)', async () => {
    state.client = {
      from: () => ({ upsert: () => Promise.resolve({ error: null }) }),
    }
    const { POST } = await import('./route')
    const res = await POST(post('dupe@example.com'))
    expect(res.headers.get('location')).toContain('/prelaunch?notify=ok')
  })

  it('redirects to notify=invalid on a malformed email and does not write', async () => {
    state.client = {
      from: () => ({ upsert: () => { throw new Error('should not be called') } }),
    }
    const { POST } = await import('./route')
    const res = await POST(post('not-an-email'))
    expect(res.headers.get('location')).toContain('/prelaunch?notify=invalid')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/api/prelaunch/notify/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 4: Write minimal implementation**

```ts
// apps/web/app/api/prelaunch/notify/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z.object({ email: z.string().email() })

export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  const form = await request.formData()
  const parsed = Schema.safeParse({ email: String(form.get('email') ?? '').trim() })

  if (!parsed.success) {
    return NextResponse.redirect(new URL('/prelaunch?notify=invalid', origin), { status: 303 })
  }

  const email = parsed.data.email.toLowerCase()
  const supabase = createServiceClient()
  await supabase
    .from('waitlist')
    .upsert({ email, source: 'prelaunch' }, { onConflict: 'email', ignoreDuplicates: true })

  return NextResponse.redirect(new URL('/prelaunch?notify=ok', origin), { status: 303 })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/api/prelaunch/notify/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260620000024_waitlist.sql apps/web/app/api/prelaunch/notify/route.ts apps/web/app/api/prelaunch/notify/route.test.ts
git commit -m "feat(web): waitlist table + prelaunch notify capture (generic success)"
```

---

### Task 5: Gate page UI (`/prelaunch`)

**Files:**
- Create: `apps/web/app/prelaunch/page.tsx`
- Test: `apps/web/app/prelaunch/page.test.tsx`

**Interfaces:**
- Consumes: nothing (standalone server component). Reads `searchParams.error` and `searchParams.notify`.
- Produces: default-export React component `PrelaunchPage({ searchParams })`. Renders two HTML forms posting to `/api/prelaunch/unlock` and `/api/prelaunch/notify`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/prelaunch/page.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PrelaunchPage from './page'

function render(searchParams: Record<string, string | undefined> = {}) {
  return renderToStaticMarkup(<PrelaunchPage searchParams={searchParams} />)
}

describe('Prelaunch gate page', () => {
  it('shows the coming-soon message and both forms', () => {
    const html = render()
    expect(html).toContain('Coming soon')
    expect(html).toContain('Developer access only')
    expect(html).toContain('action="/api/prelaunch/unlock"')
    expect(html).toContain('action="/api/prelaunch/notify"')
    expect(html).toContain('name="password"')
    expect(html).toContain('name="email"')
  })

  it('shows a password error only when error=1', () => {
    expect(render()).not.toContain('Incorrect password')
    expect(render({ error: '1' })).toContain('Incorrect password')
  })

  it('shows a thank-you only when notify=ok', () => {
    expect(render()).not.toContain("You're on the list")
    expect(render({ notify: 'ok' })).toContain("You're on the list")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/prelaunch/page.test.tsx`
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/prelaunch/page.tsx
import type { CSSProperties } from 'react'

export const metadata = { title: 'Coming soon' }

type SearchParams = { error?: string; notify?: string }

const wrap: CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-display)', padding: '24px',
}
const card: CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  boxShadow: '6px 6px 0 var(--ink)', padding: '40px', width: '100%', maxWidth: '440px',
}
const input: CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '12px', background: 'var(--bg)',
}
const button: CSSProperties = {
  width: '100%', padding: '12px 14px', border: 'none', borderRadius: 'var(--radius)',
  background: 'var(--violet)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600,
  cursor: 'pointer',
}
const divider: CSSProperties = {
  border: 'none', borderTop: '1px solid var(--line)', margin: '28px 0 20px',
}

export default function PrelaunchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main style={wrap}>
      <div style={card}>
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--violet-deep)', letterSpacing: '0.08em', margin: 0 }}>
          VIBE-CHECK
        </p>
        <h1 style={{ fontSize: '28px', margin: '8px 0 4px' }}>Coming soon</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>Developer access only.</p>

        <form action="/api/prelaunch/unlock" method="post">
          <input style={input} type="password" name="password" placeholder="Access password" autoComplete="off" required />
          {searchParams.error === '1' && (
            <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: 0 }}>Incorrect password</p>
          )}
          <button style={button} type="submit">Enter</button>
        </form>

        <hr style={divider} />

        {searchParams.notify === 'ok' ? (
          <p style={{ color: 'var(--violet-deep)', margin: 0 }}>You&apos;re on the list — we&apos;ll email you at launch.</p>
        ) : (
          <form action="/api/prelaunch/notify" method="post">
            <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '14px' }}>Get notified when we launch</p>
            <input style={input} type="email" name="email" placeholder="you@example.com" required />
            {searchParams.notify === 'invalid' && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: 0 }}>Enter a valid email</p>
            )}
            <button style={{ ...button, background: 'var(--ink)' }} type="submit">Notify me</button>
          </form>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/prelaunch/page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the whole suite and the production build**

Run: `cd apps/web && npx vitest run && npm run build`
Expected: all tests pass; build completes (the `/prelaunch` route and both API routes compile).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/prelaunch/page.tsx apps/web/app/prelaunch/page.test.tsx
git commit -m "feat(web): prelaunch coming-soon gate page (password + notify forms)"
```

---

## Manual verification (after Task 5)

With `PRELAUNCH_LOCK_ENABLED=true` and `PRELAUNCH_PASSWORD` set in `apps/web/.env.local`, run `npm run dev` and confirm:
1. Visiting `/` or `/dashboard` shows the coming-soon page (URL unchanged).
2. Wrong password → "Incorrect password"; correct password → redirected to `/`, site usable.
3. The notify form stores a row in `waitlist` and shows the thank-you state.
4. Setting `PRELAUNCH_LOCK_ENABLED=false` restores normal access with no other change.
5. The Stripe webhook path (`/api/billing/stripe-webhook`) is reachable while locked.
