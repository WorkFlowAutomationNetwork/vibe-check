# Resend Email Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire three transactional emails (welcome, scan-complete, critical-findings alert) through Resend with fire-and-forget delivery in the Next.js app.

**Architecture:** `sendEmail()` wraps the Resend SDK and swallows all errors. Welcome email fires from the auth callback for new users. Scan-complete email fires from a new internal POST endpoint the scanner calls after marking a scan done.

**Tech Stack:** `resend@^4.0.0` (already installed), Zod, httpx (Python scanner), vitest (web tests), pytest (scanner tests).

## Global Constraints

- `sendEmail()` MUST never throw — all errors caught and logged with `console.error('[email]', err)`, function resolves void.
- Notify endpoint MUST always return `200` if the `X-Internal-Key` check passes, even if the email send fails.
- Welcome email MUST only fire for new users: `Date.now() - new Date(user.created_at).getTime() < 5 * 60 * 1000`.
- Scanner notify call MUST be wrapped in try/except — errors logged, never re-raised, scan still completes.
- Scanner skips notify if `settings.web_notify_url` is empty string.
- Env var is `RESEND_API_KEY` (not `RSEND_API_KEY` — fix the typo in `.env.local`).
- `EMAIL_FROM` env var defaults to `'noreply@vibe-check-app.com'` if unset.
- Use `createServiceClient()` (not `createServerClient()`) in the notify endpoint to call `auth.admin.getUserById`.
- Plain HTML email templates — no React Email dependency.
- Run `npm test` from `apps/web/` (not repo root) and `pytest` from `apps/scanner/`.

---

### Task 1: Email client helper + env fix

**Files:**
- Create: `apps/web/lib/email/client.ts`
- Create: `apps/web/lib/email/client.test.ts`
- Modify: `apps/web/.env.local` (fix typo)
- Modify: `.env.example` (add/fix vars)

**Interfaces:**
- Produces: `sendEmail(params: { to: string; subject: string; html: string }): Promise<void>` — imported by all later tasks.

- [ ] **Step 1: Fix env var typo in `.env.local`**

In `apps/web/.env.local`, change line `RSEND_API_KEY=***REMOVED-LEAKED-RESEND-KEY***` to:
```
RESEND_API_KEY=***REMOVED-LEAKED-RESEND-KEY***
EMAIL_FROM=noreply@vibe-check-app.com
```

- [ ] **Step 2: Update `.env.example` to document the vars**

In `.env.example`, under the `# apps/web` section add (or update if already present):
```
RESEND_API_KEY=            # Resend API key
EMAIL_FROM=                # From address for transactional emails (e.g. noreply@vibe-check-app.com)
```

- [ ] **Step 3: Write the failing test**

Create `apps/web/lib/email/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: mockSend } })),
}))

import { sendEmail } from './client'

beforeEach(() => { mockSend.mockReset() })

describe('sendEmail', () => {
  it('calls resend.emails.send with correct params', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendEmail({ to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' })
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      })
    )
  })

  it('swallows errors and resolves void', async () => {
    mockSend.mockRejectedValue(new Error('network error'))
    await expect(sendEmail({ to: 'x@x.com', subject: 'S', html: '' })).resolves.toBeUndefined()
  })

  it('does not throw when resend returns an error object', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'invalid email' } })
    await expect(sendEmail({ to: 'bad', subject: 'S', html: '' })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd apps/web && npm test -- lib/email/client.test.ts
```

Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 5: Create `apps/web/lib/email/client.ts`**

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'noreply@vibe-check-app.com',
      ...params,
    })
  } catch (err) {
    console.error('[email] send failed', err)
  }
}
```

- [ ] **Step 6: Run test to confirm it passes**

```bash
cd apps/web && npm test -- lib/email/client.test.ts
```

Expected: 3/3 PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/email/client.ts apps/web/lib/email/client.test.ts apps/web/.env.local .env.example
git commit -m "feat(email): add sendEmail helper + fix RESEND_API_KEY typo"
```

---

### Task 2: Welcome email template

**Files:**
- Create: `apps/web/lib/email/templates/welcome.ts`
- Create: `apps/web/lib/email/templates/welcome.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (standalone template function)
- Produces: `welcomeEmail(email: string): { subject: string; html: string }` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/email/templates/welcome.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { welcomeEmail } from './welcome'

describe('welcomeEmail', () => {
  it('returns correct subject', () => {
    const { subject } = welcomeEmail('alice@example.com')
    expect(subject).toBe('Welcome to Vibe-Check')
  })

  it('html contains dashboard link', () => {
    const { html } = welcomeEmail('alice@example.com')
    expect(html).toContain('https://www.vibe-check-app.com/dashboard')
  })

  it('html contains user email', () => {
    const { html } = welcomeEmail('alice@example.com')
    expect(html).toContain('alice@example.com')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/web && npm test -- lib/email/templates/welcome.test.ts
```

Expected: FAIL — `Cannot find module './welcome'`

- [ ] **Step 3: Create `apps/web/lib/email/templates/welcome.ts`**

```typescript
export function welcomeEmail(email: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to Vibe-Check',
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#FAFAF7;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E6DE;border-radius:4px;padding:40px;">
    <div style="font-size:20px;font-weight:700;color:#0F0F0E;margin-bottom:32px;">✓ Vibe-Check</div>
    <h1 style="font-size:24px;font-weight:700;color:#0F0F0E;margin:0 0 16px;">You're in.</h1>
    <p style="font-size:15px;color:#54544F;line-height:1.6;margin:0 0 32px;">
      Your account is confirmed. Head to your dashboard to add your first URL and run a free passive scan.
    </p>
    <a href="https://www.vibe-check-app.com/dashboard"
       style="display:inline-block;background:#7C3AED;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;font-size:15px;">
      Go to dashboard →
    </a>
    <hr style="border:none;border-top:1px solid #E6E6DE;margin:40px 0 24px;">
    <p style="font-size:13px;color:#8A8A82;margin:0;">
      You're receiving this because you signed up at vibe-check-app.com with ${email}.
    </p>
  </div>
</body>
</html>`,
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/web && npm test -- lib/email/templates/welcome.test.ts
```

Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/email/templates/welcome.ts apps/web/lib/email/templates/welcome.test.ts
git commit -m "feat(email): add welcome email template"
```

---

### Task 3: Auth callback — send welcome to new users

**Files:**
- Modify: `apps/web/app/api/auth/callback/route.ts`
- Create: `apps/web/app/api/auth/callback/route.test.ts`

**Interfaces:**
- Consumes: `sendEmail` from `@/lib/email/client`, `welcomeEmail` from `@/lib/email/templates/welcome`
- Produces: nothing (modifies existing route behaviour)

The existing file is 27 lines. Full replacement shown in Step 3.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/auth/callback/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExchangeCodeForSession = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  })),
}))

const mockSendEmail = vi.fn()
vi.mock('@/lib/email/client', () => ({ sendEmail: mockSendEmail }))

vi.mock('@/lib/email/templates/welcome', () => ({
  welcomeEmail: vi.fn(() => ({ subject: 'Welcome', html: '<p>hi</p>' })),
}))

import { GET } from './route'

function makeRequest(code: string | null, next?: string): Request {
  const url = new URL('http://localhost/api/auth/callback')
  if (code) url.searchParams.set('code', code)
  if (next) url.searchParams.set('next', next)
  return new Request(url.toString())
}

const NEW_USER_CREATED_AT = new Date(Date.now() - 60_000).toISOString()     // 1 min ago
const OLD_USER_CREATED_AT = new Date(Date.now() - 10 * 60_000).toISOString() // 10 min ago

beforeEach(() => {
  mockExchangeCodeForSession.mockReset()
  mockSendEmail.mockReset()
})

describe('GET /api/auth/callback', () => {
  it('redirects to /dashboard on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { email: 'a@b.com', created_at: NEW_USER_CREATED_AT } },
      error: null,
    })
    const res = await GET(makeRequest('valid-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('sends welcome email to new users (created < 5 min ago)', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { email: 'new@example.com', created_at: NEW_USER_CREATED_AT } },
      error: null,
    })
    await GET(makeRequest('valid-code'))
    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@example.com' })
    )
  })

  it('does NOT send welcome email to returning users (created > 5 min ago)', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { email: 'old@example.com', created_at: OLD_USER_CREATED_AT } },
      error: null,
    })
    await GET(makeRequest('valid-code'))
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('redirects to sign-in on exchange error', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid code' },
    })
    const res = await GET(makeRequest('bad-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sign-in')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('redirects to sign-in when no code param', async () => {
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sign-in')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/web && npm test -- app/api/auth/callback/route.test.ts
```

Expected: FAIL — `sendEmail` mock is called but tests can't find the import

- [ ] **Step 3: Replace `apps/web/app/api/auth/callback/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/client'
import { welcomeEmail } from '@/lib/email/templates/welcome'

function safeNext(next: string | null): string {
  if (!next) return '/dashboard'
  if (next[0] !== '/' || next[1] === '/' || next[1] === '\\') return '/dashboard'
  return next
}

function isNewUser(createdAt: string | undefined): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < 5 * 60 * 1000
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = createServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data.user
      if (user?.email && isNewUser(user.created_at)) {
        const { subject, html } = welcomeEmail(user.email)
        await sendEmail({ to: user.email, subject, html })
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/web && npm test -- app/api/auth/callback/route.test.ts
```

Expected: 5/5 PASS

- [ ] **Step 5: Run full suite to check for regressions**

```bash
cd apps/web && npm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/auth/callback/route.ts apps/web/app/api/auth/callback/route.test.ts
git commit -m "feat(email): send welcome email to new users on auth callback"
```

---

### Task 4: Scan-complete email template + notify endpoint

**Files:**
- Create: `apps/web/lib/email/templates/scan-complete.ts`
- Create: `apps/web/lib/email/templates/scan-complete.test.ts`
- Create: `apps/web/app/api/notify/scan-complete/route.ts`
- Create: `apps/web/app/api/notify/scan-complete/route.test.ts`

**Interfaces:**
- Consumes: `sendEmail` from `@/lib/email/client`, `createServiceClient` from `@/lib/supabase/server`
- Produces: `POST /api/notify/scan-complete` — called by the scanner in Task 5.

Note: `createServiceClient` (service role key, used here) is different from `createServerClient` (anon key, used for user sessions). Only `createServiceClient` can call `auth.admin.getUserById`.

- [ ] **Step 1: Write the failing template tests**

Create `apps/web/lib/email/templates/scan-complete.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scanCompleteEmail } from './scan-complete'

const base = { url: 'https://example.com', grade: 'B', scanId: 'scan-123', hasCritical: false }

describe('scanCompleteEmail', () => {
  it('subject contains grade when no critical findings', () => {
    const { subject } = scanCompleteEmail(base)
    expect(subject).toBe('Your scan is ready — Grade B')
  })

  it('subject signals critical when hasCritical is true', () => {
    const { subject } = scanCompleteEmail({ ...base, hasCritical: true })
    expect(subject).toContain('Critical')
  })

  it('html contains the report URL', () => {
    const { html } = scanCompleteEmail(base)
    expect(html).toContain('https://www.vibe-check-app.com/report/scan-123')
  })

  it('html contains the scanned URL', () => {
    const { html } = scanCompleteEmail(base)
    expect(html).toContain('https://example.com')
  })

  it('html contains critical warning section when hasCritical is true', () => {
    const { html } = scanCompleteEmail({ ...base, hasCritical: true })
    expect(html).toContain('Critical issues')
  })

  it('html does NOT contain critical warning when hasCritical is false', () => {
    const { html } = scanCompleteEmail(base)
    expect(html).not.toContain('Critical issues')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/web && npm test -- lib/email/templates/scan-complete.test.ts
```

Expected: FAIL — `Cannot find module './scan-complete'`

- [ ] **Step 3: Create `apps/web/lib/email/templates/scan-complete.ts`**

```typescript
const GRADE_COLOUR: Record<string, string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#ea580c',
  F: '#dc2626',
}

export function scanCompleteEmail(params: {
  url: string
  grade: string
  scanId: string
  hasCritical: boolean
}): { subject: string; html: string } {
  const { url, grade, scanId, hasCritical } = params
  const gradeColour = GRADE_COLOUR[grade] ?? '#54544F'
  const reportUrl = `https://www.vibe-check-app.com/report/${scanId}`
  const subject = hasCritical
    ? `⚠️ Critical issues found — ${url}`
    : `Your scan is ready — Grade ${grade}`

  const criticalBanner = hasCritical
    ? `<div style="background:#FEE2E2;border-left:4px solid #dc2626;padding:16px;border-radius:0 4px 4px 0;margin-bottom:24px;">
        <strong style="color:#991b1b;">Critical issues found</strong>
        <p style="margin:4px 0 0;font-size:14px;color:#7f1d1d;">
          Your scan detected critical security issues that need immediate attention. View the full report for details and remediation steps.
        </p>
      </div>`
    : ''

  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#FAFAF7;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E6DE;border-radius:4px;padding:40px;">
    <div style="font-size:20px;font-weight:700;color:#0F0F0E;margin-bottom:32px;">✓ Vibe-Check</div>
    ${criticalBanner}
    <h1 style="font-size:24px;font-weight:700;color:#0F0F0E;margin:0 0 8px;">Scan complete</h1>
    <p style="font-size:14px;color:#54544F;margin:0 0 24px;">${url}</p>
    <div style="display:inline-block;background:#F2F2EC;border-radius:4px;padding:16px 24px;margin-bottom:32px;">
      <span style="font-size:13px;color:#54544F;display:block;margin-bottom:4px;">Security grade</span>
      <span style="font-size:48px;font-weight:700;color:${gradeColour};line-height:1;">${grade}</span>
    </div>
    <br>
    <a href="${reportUrl}"
       style="display:inline-block;background:#7C3AED;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;font-size:15px;">
      View full report →
    </a>
    <hr style="border:none;border-top:1px solid #E6E6DE;margin:40px 0 24px;">
    <p style="font-size:13px;color:#8A8A82;margin:0;">
      You're receiving this because you have scan notifications enabled on vibe-check-app.com.
    </p>
  </div>
</body>
</html>`,
  }
}
```

- [ ] **Step 4: Run template tests**

```bash
cd apps/web && npm test -- lib/email/templates/scan-complete.test.ts
```

Expected: 6/6 PASS

- [ ] **Step 5: Write the failing notify endpoint tests**

Create `apps/web/app/api/notify/scan-complete/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserById = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => ({
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}))

const mockSendEmail = vi.fn()
vi.mock('@/lib/email/client', () => ({ sendEmail: mockSendEmail }))

vi.mock('@/lib/email/templates/scan-complete', () => ({
  scanCompleteEmail: vi.fn(() => ({ subject: 'Ready', html: '<p>done</p>' })),
}))

import { POST } from './route'

const VALID_KEY = 'test-internal-key'

function makeRequest(body: unknown, key?: string): Request {
  return new Request('http://localhost/api/notify/scan-complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key !== undefined ? { 'x-internal-key': key } : {}),
    },
    body: JSON.stringify(body),
  })
}

const validBody = {
  scan_id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  url: 'https://example.com',
  grade: 'B',
  has_critical: false,
}

beforeEach(() => {
  vi.stubEnv('SCANNER_INTERNAL_KEY', VALID_KEY)
  mockGetUserById.mockReset()
  mockSendEmail.mockReset()
})

describe('POST /api/notify/scan-complete', () => {
  it('returns 401 for missing key', async () => {
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns 401 for wrong key', async () => {
    const res = await POST(makeRequest(validBody, 'wrong-key'))
    expect(res.status).toBe(401)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns 422 for malformed body', async () => {
    const res = await POST(makeRequest({ bad: true }, VALID_KEY))
    expect(res.status).toBe(422)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('sends email and returns 200 for valid request', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { email: 'u@x.com' } }, error: null })
    const res = await POST(makeRequest(validBody, VALID_KEY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'u@x.com' })
    )
  })

  it('returns 200 without sending email when user has no email', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { email: null } }, error: null })
    const res = await POST(makeRequest(validBody, VALID_KEY))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run to confirm it fails**

```bash
cd apps/web && npm test -- app/api/notify/scan-complete/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 7: Create `apps/web/app/api/notify/scan-complete/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/client'
import { scanCompleteEmail } from '@/lib/email/templates/scan-complete'

const NotifySchema = z.object({
  scan_id: z.string().uuid(),
  user_id: z.string().uuid(),
  url: z.string().url(),
  grade: z.string().min(1).max(1),
  has_critical: z.boolean(),
})

export async function POST(request: Request) {
  const key = request.headers.get('x-internal-key')
  if (!key || key !== process.env.SCANNER_INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = NotifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { scan_id, user_id, url, grade, has_critical } = parsed.data

  const supabase = createServiceClient()
  const { data } = await supabase.auth.admin.getUserById(user_id)
  const email = data.user?.email

  if (email) {
    const { subject, html } = scanCompleteEmail({ url, grade, scanId: scan_id, hasCritical: has_critical })
    await sendEmail({ to: email, subject, html })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Run notify endpoint tests**

```bash
cd apps/web && npm test -- app/api/notify/scan-complete/route.test.ts
```

Expected: 5/5 PASS

- [ ] **Step 9: Run full suite**

```bash
cd apps/web && npm test
```

Expected: all tests pass

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/email/templates/scan-complete.ts apps/web/lib/email/templates/scan-complete.test.ts apps/web/app/api/notify/scan-complete/route.ts apps/web/app/api/notify/scan-complete/route.test.ts
git commit -m "feat(email): scan-complete template and internal notify endpoint"
```

---

### Task 5: Scanner calls notify endpoint on scan completion

**Files:**
- Modify: `apps/scanner/lib/settings.py`
- Modify: `apps/scanner/jobs/tasks.py`
- Create: `apps/scanner/tests/test_notify.py`

**Interfaces:**
- Consumes: `settings.web_notify_url` (added in this task), `settings.scanner_internal_key` (already exists)
- Produces: nothing (side effect: HTTP POST to Next.js notify endpoint after scan completes)

The notify call goes right after `_mark_scan(scan_id, status='completed', ...)` in `_execute_scan`. It must be wrapped in try/except and must never raise.

- [ ] **Step 1: Write the failing tests**

Create `apps/scanner/tests/test_notify.py`:

```python
from unittest.mock import patch, MagicMock
import pytest
from jobs.tasks import _execute_scan


class _FakeSelf:
    class request:
        retries = 0
    max_retries = 3
    def retry(self, exc):
        raise exc


def _make_mock_scanner(findings):
    m = MagicMock()
    m.return_value.run.return_value = findings
    return m


@pytest.fixture(autouse=True)
def _patch_common(monkeypatch):
    monkeypatch.setattr("jobs.tasks.consent.verify", lambda url_id: "https://example.com")
    monkeypatch.setattr("jobs.tasks._mark_scan", lambda scan_id, **kw: None)
    monkeypatch.setattr("jobs.tasks.log_event", lambda *a, **kw: None)
    monkeypatch.setattr("jobs.tasks.grade", lambda findings: ("B", 75))
    monkeypatch.setattr("jobs.tasks.render_report_pdf", lambda *a, **kw: b"pdf")
    monkeypatch.setattr("jobs.tasks.upload_report_pdf", lambda *a, **kw: "path/to.pdf")
    monkeypatch.setattr("jobs.tasks.issue_badge", lambda *a, **kw: {"expires_at": "2027-01-01T00:00:00"})
    monkeypatch.setattr(
        "jobs.tasks._scanners_for_tier",
        lambda scan_type: [_make_mock_scanner([])],
    )


def test_notify_posted_when_web_notify_url_set(monkeypatch):
    monkeypatch.setattr("jobs.tasks.settings.web_notify_url", "https://app.example.com")
    monkeypatch.setattr("jobs.tasks.settings.scanner_internal_key", "secret-key")

    with patch("httpx.post") as mock_post:
        _execute_scan(_FakeSelf(), "scan-1", "url-1", "active", "user-1")

    mock_post.assert_called_once()
    call_args, call_kwargs = mock_post.call_args
    assert call_args[0] == "https://app.example.com/api/notify/scan-complete"
    payload = call_kwargs["json"]
    assert payload["scan_id"] == "scan-1"
    assert payload["user_id"] == "user-1"
    assert payload["grade"] == "B"
    assert "has_critical" in payload


def test_notify_skipped_when_web_notify_url_empty(monkeypatch):
    monkeypatch.setattr("jobs.tasks.settings.web_notify_url", "")

    with patch("httpx.post") as mock_post:
        _execute_scan(_FakeSelf(), "scan-1", "url-1", "active", "user-1")

    mock_post.assert_not_called()


def test_notify_error_does_not_fail_scan(monkeypatch):
    monkeypatch.setattr("jobs.tasks.settings.web_notify_url", "https://app.example.com")
    monkeypatch.setattr("jobs.tasks.settings.scanner_internal_key", "secret-key")

    with patch("httpx.post", side_effect=Exception("network error")):
        # Should not raise
        _execute_scan(_FakeSelf(), "scan-1", "url-1", "active", "user-1")
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/scanner && pytest tests/test_notify.py -v
```

Expected: FAIL — `ImportError` or attribute errors because `settings` has no `web_notify_url` and `tasks.py` doesn't import `httpx`

- [ ] **Step 3: Add `web_notify_url` to `apps/scanner/lib/settings.py`**

Replace the full file content:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    redis_url: str = "redis://localhost:6379"
    scanner_internal_key: str
    scanner_version: str = "0.1.0"
    max_concurrent_scans: int = 5
    github_app_id: str | None = None
    github_app_private_key: str | None = None
    github_api_url: str = "https://api.github.com"
    web_notify_url: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

- [ ] **Step 4: Add notify call to `apps/scanner/jobs/tasks.py`**

Add `import httpx` at the top of `tasks.py` (after the existing imports block).

Then, in `_execute_scan`, locate the block that starts:

```python
        _mark_scan(
            scan_id,
            status="completed",
            grade=letter,
            score=score,
            completed_at=_now(),
            scanner_version=settings.scanner_version,
            pdf_storage_path=pdf_storage_path,
        )
```

After that block (and before the `log_event` call), add:

```python
        if settings.web_notify_url:
            try:
                has_critical = any(f.severity == "critical" for f in findings)
                httpx.post(
                    f"{settings.web_notify_url}/api/notify/scan-complete",
                    json={
                        "scan_id": scan_id,
                        "user_id": user_id,
                        "url": url,
                        "grade": letter,
                        "has_critical": has_critical,
                    },
                    headers={"x-internal-key": settings.scanner_internal_key},
                    timeout=5.0,
                )
            except Exception as exc:
                print(f"[notify] failed to call web notify endpoint: {exc}")
```

The full modified section in context (lines 107–120 of tasks.py before this change):

```python
        _mark_scan(
            scan_id,
            status="completed",
            grade=letter,
            score=score,
            completed_at=_now(),
            scanner_version=settings.scanner_version,
            pdf_storage_path=pdf_storage_path,
        )

        if settings.web_notify_url:
            try:
                has_critical = any(f.severity == "critical" for f in findings)
                httpx.post(
                    f"{settings.web_notify_url}/api/notify/scan-complete",
                    json={
                        "scan_id": scan_id,
                        "user_id": user_id,
                        "url": url,
                        "grade": letter,
                        "has_critical": has_critical,
                    },
                    headers={"x-internal-key": settings.scanner_internal_key},
                    timeout=5.0,
                )
            except Exception as exc:
                print(f"[notify] failed to call web notify endpoint: {exc}")

        log_event(user_id, "scan_completed", url_id=url_id, scan_id=scan_id,
                  payload={"url": url, "grade": letter, "score": score,
                           "detail": f"Grade {letter} · {scan_type} scan"})
```

- [ ] **Step 5: Add `WEB_NOTIFY_URL` to scanner's `.env`**

In `apps/scanner/.env` (or wherever the scanner's env file lives), add:
```
WEB_NOTIFY_URL=https://www.vibe-check-app.com
```

- [ ] **Step 6: Run notify tests**

```bash
cd apps/scanner && pytest tests/test_notify.py -v
```

Expected: 3/3 PASS

- [ ] **Step 7: Run full scanner test suite**

```bash
cd apps/scanner && pytest
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/scanner/lib/settings.py apps/scanner/jobs/tasks.py apps/scanner/tests/test_notify.py
git commit -m "feat(scanner): call web notify endpoint after scan completion"
```
