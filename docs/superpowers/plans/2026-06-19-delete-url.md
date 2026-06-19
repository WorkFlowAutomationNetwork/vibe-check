# Delete a URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user remove a URL that has no scans, via `DELETE /api/urls/[id]` and a dashboard remove button, and stand up the `apps/web` vitest harness as part of it.

**Architecture:** Hard delete the `urls` row through the user-scoped Supabase client; a new RLS `DELETE` policy enforces owner + no-scans at the DB layer. The route adds a friendly 409 pre-check and logs a `url_removed` activity event. The dashboard server component shows a client `RemoveUrlButton` only for URLs with zero scans. Route logic is covered by the first vitest tests in `apps/web`.

**Tech Stack:** Next.js 14 App Router (route handlers), TypeScript strict, Supabase (Postgres + RLS), vitest + @vitest/coverage-v8.

## Global Constraints

- TypeScript strict mode — always on.
- Supabase **server** client (`createServerClient` from `@/lib/supabase/server`) in route handlers; never the browser client.
- `'use client'` only where interactivity is needed.
- Path alias: `@/*` → `apps/web/*` (from `tsconfig.json`).
- No native `confirm()`/`alert()` dialogs in UI — they block the page.
- Design-system CSS classes/vars only (`btn-mini`, `ghost`, `var(--…)`); no conflicting Tailwind utilities.
- Activity logging is best-effort and must never change the API response.
- Next migration number follows `20260618000020`; use `20260619000021`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Stand up the vitest harness

**Files:**
- Modify: `apps/web/package.json` (devDependencies + scripts)
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/lib/__tests__/sanity.test.ts` (temporary smoke test, deleted in Step 6)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (alias `vitest run`) and `npm run test:watch` available in `apps/web`; `@/` alias resolves in tests.

- [ ] **Step 1: Install vitest devDependencies**

Run (from `apps/web`):
```bash
npm install -D vitest@^2.1.0 @vitest/coverage-v8@^2.1.0
```
Expected: `package.json` devDependencies gains both; install succeeds.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
  },
})
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block, add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

Create `apps/web/lib/__tests__/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run the harness**

Run (from `apps/web`): `npm test`
Expected: 1 passed; vitest exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.ts apps/web/lib/__tests__/sanity.test.ts
git commit -m "chore(web): stand up vitest harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(The smoke test is removed in Task 5 Step 4 once a real test exists.)

---

### Task 2: RLS migration — user delete policy with no-scans guard

**Files:**
- Create: `supabase/migrations/20260619000021_urls_user_delete_policy.sql`

**Interfaces:**
- Consumes: existing `public.urls`, `public.scans` tables.
- Produces: authenticated users can `DELETE` their own `urls` rows **only when no `scans` reference them**.

- [ ] **Step 1: Write the migration**

```sql
-- Allow a user to hard-delete one of their own URLs, but only while it has no
-- scans. Once a scan exists the URL has history (findings, possibly a badge) and
-- must not be silently removed. The no-scans rule is enforced here in the policy
-- USING clause so it holds even if the app-layer check is bypassed.
create policy "users can delete own urls without scans"
  on public.urls for delete
  using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.scans where scans.url_id = urls.id
    )
  );
```

- [ ] **Step 2: Apply the migration**

Apply to the Supabase project (`lvkiflbpbtmlrgdftivt`) using the migration name `urls_user_delete_policy` and the SQL above (via the Supabase apply-migration tooling or `npx supabase db push`).
Expected: migration applies cleanly; no error.

- [ ] **Step 3: Verify the policy exists**

Run this query against the project:
```sql
select polname, cmd from pg_policies
where schemaname = 'public' and tablename = 'urls' and cmd = 'DELETE';
```
Expected: rows include `users can delete own urls without scans` and the existing `admin can delete urls`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619000021_urls_user_delete_policy.sql
git commit -m "feat(db): RLS policy for user URL deletion (no-scans guard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `DELETE /api/urls/[id]` route (TDD)

**Files:**
- Create: `apps/web/app/api/urls/[id]/route.test.ts`
- Create: `apps/web/app/api/urls/[id]/route.ts`

**Interfaces:**
- Consumes: `createServerClient` from `@/lib/supabase/server`; `logActivity` from `@/lib/activity` (signature: `{ userId, eventType, urlId?, scanId?, payload? }`).
- Produces: `export async function DELETE(request: Request, ctx: { params: { id: string } }): Promise<NextResponse>` returning the status/body contract below.

Response contract:

| Condition | Status | Body |
|---|---|---|
| No auth | 401 | `{ error: 'Unauthorized' }` |
| URL not found / not owned | 404 | `{ error: 'not_found' }` |
| URL has ≥1 scan | 409 | `{ error: 'url_has_scans' }` |
| DB delete error | 500 | `{ error: 'delete_failed' }` |
| Success | 200 | `{ ok: true }` |

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/urls/[id]/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mocks ---
const getUser = vi.fn()
const logActivity = vi.fn()

// Mutable handles the test sets per-case.
let urlSelectResult: { data: unknown } = { data: null }
let scanCountResult: { count: number } = { count: 0 }
let deleteResult: { error: unknown } = { error: null }
const deleteEq = vi.fn()

function makeClient() {
  return {
    auth: { getUser },
    from(table: string) {
      if (table === 'urls') {
        return {
          // SELECT chain: .select().eq().eq().is().maybeSingle()
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => urlSelectResult,
                }),
              }),
            }),
          }),
          // DELETE chain: .delete().eq().eq()
          delete: () => ({
            eq: () => ({
              eq: (...args: unknown[]) => {
                deleteEq(...args)
                return Promise.resolve(deleteResult)
              },
            }),
          }),
        }
      }
      if (table === 'scans') {
        return {
          select: () => ({
            eq: async () => scanCountResult,
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => makeClient(),
}))
vi.mock('@/lib/activity', () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}))

import { DELETE } from './route'

function call(id = 'url-1') {
  return DELETE(new Request('http://localhost/api/urls/' + id, { method: 'DELETE' }), {
    params: { id },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  urlSelectResult = { data: { id: 'url-1', url: 'https://example.com' } }
  scanCountResult = { count: 0 }
  deleteResult = { error: null }
})

describe('DELETE /api/urls/[id]', () => {
  it('401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('404 when URL not found or not owned', async () => {
    urlSelectResult = { data: null }
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('409 when the URL has scans', async () => {
    scanCountResult = { count: 2 }
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'url_has_scans' })
  })

  it('500 when the delete fails', async () => {
    deleteResult = { error: { message: 'boom' } }
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'delete_failed' })
  })

  it('200 deletes, logs url_removed with no url_id', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(deleteEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(logActivity).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'url_removed',
      payload: { url: 'https://example.com' },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/web`): `npm test -- route.test`
Expected: FAIL — cannot import `DELETE` from `./route` (file does not exist).

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/urls/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Must exist, be owned by this user, and not already soft-deleted.
  const { data: urlRow } = await supabase
    .from('urls')
    .select('id, url')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!urlRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Any scan (any status) blocks removal.
  const { count } = await supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('url_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'url_has_scans' }, { status: 409 })
  }

  const { error: deleteError } = await supabase
    .from('urls')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  // Row is gone — log the URL string in payload, no url_id (FK would dangle).
  await logActivity({
    userId: user.id,
    eventType: 'url_removed',
    payload: { url: urlRow.url },
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
```

Note on the `scans` count mock: the test stubs `.select()` to return an object whose `.eq()` resolves to `{ count }`. The real call passes `{ count: 'exact', head: true }` to `.select()` — harmless to the stub, which ignores its arguments.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/web`): `npm test -- route.test`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/urls/[id]/route.ts apps/web/app/api/urls/[id]/route.test.ts
git commit -m "feat(web): DELETE /api/urls/[id] with no-scans guard + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `RemoveUrlButton` client component

**Files:**
- Create: `apps/web/components/dashboard/RemoveUrlButton.tsx`

**Interfaces:**
- Consumes: `DELETE /api/urls/[id]` route.
- Produces: `export default function RemoveUrlButton({ urlId, urlLabel }: { urlId: string; urlLabel: string })`.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RemoveUrlButton({ urlId, urlLabel }: { urlId: string; urlLabel: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleRemove() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/urls/${urlId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data?.error === 'url_has_scans' ? 'has scans' : 'failed')
      setLoading(false)
    } catch {
      setError('failed')
      setLoading(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn-mini ghost"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${urlLabel}`}
      >
        ✕ Remove
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
        {error ? `Couldn't remove (${error})` : 'Remove?'}
      </span>
      <button type="button" className="btn-mini" onClick={handleRemove} disabled={loading}>
        {loading ? '…' : '✓ yes'}
      </button>
      <button
        type="button"
        className="btn-mini ghost"
        onClick={() => { setConfirming(false); setError(null) }}
        disabled={loading}
      >
        ✗ no
      </button>
    </span>
  )
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npm run type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/dashboard/RemoveUrlButton.tsx
git commit -m "feat(web): RemoveUrlButton with inline confirm

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire the button into the dashboard

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`
- Delete: `apps/web/lib/__tests__/sanity.test.ts`

**Interfaces:**
- Consumes: `RemoveUrlButton` from Task 4; `allScans` already loaded in the page.
- Produces: remove button rendered for URLs with no scans; `url_removed` in the activity display map.

- [ ] **Step 1: Import the component**

In `apps/web/app/(app)/dashboard/page.tsx`, after the `RescanButton` import (line 4):
```tsx
import RemoveUrlButton from '@/components/dashboard/RemoveUrlButton'
```

- [ ] **Step 2: Add the `url_removed` display entry**

In the `EVENT_DISPLAY` map (after the `url_added` line, ~line 18):
```tsx
  url_removed:    { glyph: '✕', label: 'URL removed',     cls: '' },
```

- [ ] **Step 3: Build a has-any-scan set and render the button**

After the `latestScanByUrlId` block (~line 87), add:
```tsx
  // URLs with any scan (any status) cannot be removed.
  const hasScanByUrlId = new Set<string>(allScans.map(s => s.url_id))
```

In the card footer `.righty` div (currently lines ~282-287), replace:
```tsx
                    <div className="righty">
                      {latestScan && (
                        <Link href={`/report/${latestScan.id}`} className="btn-mini ghost">View report</Link>
                      )}
                      {url.verified && <RescanButton urlId={url.id} />}
                    </div>
```
with:
```tsx
                    <div className="righty">
                      {latestScan && (
                        <Link href={`/report/${latestScan.id}`} className="btn-mini ghost">View report</Link>
                      )}
                      {url.verified && <RescanButton urlId={url.id} />}
                      {!hasScanByUrlId.has(url.id) && (
                        <RemoveUrlButton urlId={url.id} urlLabel={cleanUrl} />
                      )}
                    </div>
```

- [ ] **Step 4: Remove the temporary smoke test**

```bash
git rm apps/web/lib/__tests__/sanity.test.ts
```

- [ ] **Step 5: Type-check and test**

Run (from `apps/web`): `npm run type-check && npm test`
Expected: no type errors; route tests pass (5 passed); no remaining sanity test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(app)/dashboard/page.tsx
git commit -m "feat(web): show RemoveUrlButton on scanless URL cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final verification (verification-before-completion)

**Files:** none (verification only).

- [ ] **Step 1: Full build + type-check + tests**

Run (from `apps/web`):
```bash
npm run type-check && npm run build && npm test
```
Expected: type-check clean; build succeeds; tests pass.

- [ ] **Step 2: Manual dashboard flow (dev server)**

Run `npm run dev`, then in the browser:
1. Add a URL (no scan) → card shows "✕ Remove".
2. Click Remove → inline "Remove?" → "✓ yes" → card disappears; `URL removed` appears in Recent activity.
3. Add a URL and run a scan → its card no longer shows "✕ Remove".
4. (Optional) With devtools, `fetch('/api/urls/<scanned-id>', {method:'DELETE'})` → 409 `url_has_scans`.

Expected: all four behave as described.

- [ ] **Step 3: Update PROJECT_STATUS.md**

- Remove `DELETE /api/urls/[id]` from Gaps #1 (now built).
- Under Pages → API routes, change "**Missing:** no `DELETE /api/urls/[id]`" to note it now exists.
- Confirm Gap #8 (web test backfill) still reads correctly now that the harness exists.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: mark DELETE /api/urls/[id] complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
