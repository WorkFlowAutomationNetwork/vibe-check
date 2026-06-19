# SSRF Protection for Verification Fetches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/api/verify` from issuing server-side fetches to private/reserved IPs (SSRF, finding S1), including via redirects and DNS rebinding, and reject internal URLs at add-time.

**Architecture:** A new `lib/security/ssrf.ts` centralises host safety: pure `isPrivateIp`/`assertSafeHostname` checks plus a `safeFetch` backed by a custom `undici` Agent whose `connect.lookup` validates the resolved IP of every connection (including each redirect hop). `/api/verify` fetches through `safeFetch` and pre-checks the host; `/api/urls` POST runs the cheap sync host check before any DB write.

**Tech Stack:** Next.js 14 App Router (Node runtime), TypeScript strict, `undici` (explicit dep), Node `dns`/`net`, vitest.

## Global Constraints

- TypeScript strict mode always on.
- Node runtime only (no `export const runtime = 'edge'`); `undici` is a server-only import.
- Add dependency `undici@^6` to `apps/web` (matches the version bundled with Next 14; already present transitively).
- Blocked IPv4 CIDRs: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`, `255.255.255.255/32`.
- Blocked IPv6: `::1`, `::`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`; IPv4-mapped `::ffff:a.b.c.d` unwrapped and checked as IPv4.
- Blocked hostnames: exact `localhost`, `metadata`, `metadata.google.internal`; suffixes `.localhost`, `.local`, `.internal`.
- Both 422 responses use body `{ error: 'unsupported_host' }`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `lib/security/ssrf.ts` core (TDD)

**Files:**
- Modify: `apps/web/package.json` (add `undici` dependency)
- Create: `apps/web/lib/security/ssrf.ts`
- Create: `apps/web/lib/security/ssrf.test.ts`

**Interfaces:**
- Consumes: nothing (Node `dns`/`net`, `undici`).
- Produces:
  - `class SsrfError extends Error`
  - `function isPrivateIp(ip: string): boolean`
  - `function assertSafeHostname(hostname: string): void` (throws `SsrfError`)
  - `function validatingLookup(hostname: string, options: unknown, callback: (err: NodeJS.ErrnoException | null, address?: string, family?: number) => void): void`
  - `function safeFetch(url: string, init?: Parameters<typeof import('undici').fetch>[1]): ReturnType<typeof import('undici').fetch>` — resolves to an undici `Response` (has `.ok`, `.text()`).

- [ ] **Step 1: Install undici**

Run (from `apps/web`): `npm install undici@^6`
Expected: `undici` added to `dependencies`; install succeeds.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/lib/security/ssrf.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:dns', () => ({ default: { lookup: vi.fn() } }))
import dns from 'node:dns'
import { isPrivateIp, assertSafeHostname, validatingLookup, SsrfError } from './ssrf'

describe('isPrivateIp', () => {
  it.each([
    '10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.16.0.1',
    '100.64.0.1', '0.0.0.0', '255.255.255.255',
    '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each([
    '8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1::', '::ffff:8.8.8.8',
  ])('allows %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false)
  })

  it('treats an invalid IP literal as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true)
  })
})

describe('assertSafeHostname', () => {
  it.each(['localhost', 'LOCALHOST', 'foo.internal', 'x.local', 'a.localhost',
    'metadata', 'metadata.google.internal', '127.0.0.1', '[::1]', ''])(
    'throws for %s', (host) => {
      expect(() => assertSafeHostname(host)).toThrow(SsrfError)
    })

  it.each(['example.com', 'sub.example.co.uk', '8.8.8.8'])('allows %s', (host) => {
    expect(() => assertSafeHostname(host)).not.toThrow()
  })
})

describe('validatingLookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the first address when all resolved IPs are public', () => {
    ;(dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_h: string, _o: unknown, cb: (e: unknown, a: unknown) => void) =>
        cb(null, [{ address: '93.184.216.34', family: 4 }]),
    )
    const cb = vi.fn()
    validatingLookup('example.com', {}, cb)
    expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4)
  })

  it('blocks when any resolved IP is private', () => {
    ;(dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_h: string, _o: unknown, cb: (e: unknown, a: unknown) => void) =>
        cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]),
    )
    const cb = vi.fn()
    validatingLookup('rebind.test', {}, cb)
    expect(cb).toHaveBeenCalledWith(expect.any(SsrfError))
  })

  it('propagates a DNS error', () => {
    const dnsErr = new Error('ENOTFOUND')
    ;(dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_h: string, _o: unknown, cb: (e: unknown) => void) => cb(dnsErr),
    )
    const cb = vi.fn()
    validatingLookup('missing.test', {}, cb)
    expect(cb).toHaveBeenCalledWith(dnsErr)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `apps/web`): `npm test -- ssrf`
Expected: FAIL — cannot import from `./ssrf` (module does not exist).

- [ ] **Step 4: Implement `lib/security/ssrf.ts`**

Create `apps/web/lib/security/ssrf.ts`:
```ts
import net from 'node:net'
import dns from 'node:dns'
import { Agent, fetch as undiciFetch } from 'undici'

export class SsrfError extends Error {}

const BLOCKED_NAMES = new Set(['localhost', 'metadata', 'metadata.google.internal'])

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map(Number)
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
]

function isPrivateIpv4(ip: string): boolean {
  const v = ipv4ToInt(ip)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (v & mask) === (ipv4ToInt(base) & mask)
  })
}

function ipv6ToBytes(ip: string): number[] | null {
  let addr = ip.toLowerCase()
  const pct = addr.indexOf('%')
  if (pct !== -1) addr = addr.slice(0, pct)

  // Convert a trailing embedded IPv4 (e.g. ::ffff:127.0.0.1) into two hextets.
  const lastColon = addr.lastIndexOf(':')
  const tail = lastColon === -1 ? '' : addr.slice(lastColon + 1)
  if (tail.includes('.')) {
    if (!net.isIPv4(tail)) return null
    const o = tail.split('.').map(Number)
    const hi = ((o[0] << 8) | o[1]).toString(16)
    const lo = ((o[2] << 8) | o[3]).toString(16)
    addr = addr.slice(0, lastColon + 1) + hi + ':' + lo
  }

  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tailH = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []
  let hextets: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tailH.length
    if (missing < 1) return null
    hextets = [...head, ...Array(missing).fill('0'), ...tailH]
  } else {
    hextets = head
  }
  if (hextets.length !== 8) return null

  const bytes: number[] = []
  for (const h of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null
    const v = parseInt(h, 16)
    bytes.push((v >> 8) & 0xff, v & 0xff)
  }
  return bytes
}

function isPrivateIpv6(ip: string): boolean {
  const b = ipv6ToBytes(ip)
  if (!b) return true
  const mapped = b.slice(0, 10).every(x => x === 0) && b[10] === 0xff && b[11] === 0xff
  if (mapped) return isPrivateIpv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`)
  if (b.every(x => x === 0)) return true                            // ::
  if (b.slice(0, 15).every(x => x === 0) && b[15] === 1) return true // ::1
  if ((b[0] & 0xfe) === 0xfc) return true                          // fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true         // fe80::/10
  if (b[0] === 0xff) return true                                    // ff00::/8
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true // 2001:db8::/32
  return false
}

export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip)
  if (kind === 4) return isPrivateIpv4(ip)
  if (kind === 6) return isPrivateIpv6(ip)
  return true // not a valid IP literal → unsafe
}

export function assertSafeHostname(hostname: string): void {
  const h = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase().replace(/\.$/, '')
  if (!h) throw new SsrfError('empty host')
  if (
    BLOCKED_NAMES.has(h) ||
    h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')
  ) {
    throw new SsrfError(`blocked hostname: ${h}`)
  }
  if (net.isIP(h) && isPrivateIp(h)) {
    throw new SsrfError(`blocked address: ${h}`)
  }
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string, family?: number) => void

export function validatingLookup(hostname: string, _options: unknown, callback: LookupCb): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err)
    const blocked = addresses.find(a => isPrivateIp(a.address))
    if (blocked) {
      return callback(new SsrfError(`blocked address: ${blocked.address}`) as NodeJS.ErrnoException)
    }
    const first = addresses[0]
    if (!first) return callback(new SsrfError('no addresses') as NodeJS.ErrnoException)
    callback(null, first.address, first.family)
  })
}

const ssrfAgent = new Agent({ connect: { lookup: validatingLookup } })

export function safeFetch(url: string, init?: Parameters<typeof undiciFetch>[1]) {
  const { hostname } = new URL(url)
  assertSafeHostname(hostname)
  return undiciFetch(url, { ...init, dispatcher: ssrfAgent })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `apps/web`): `npm test -- ssrf`
Expected: all green (isPrivateIp, assertSafeHostname, validatingLookup blocks).
If any case fails, debug the corresponding parser/CIDR branch — do not weaken a test.

- [ ] **Step 6: Type-check**

Run (from `apps/web`): `npm run type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/security/ssrf.ts apps/web/lib/security/ssrf.test.ts
git commit -m "feat(web): SSRF guard lib (isPrivateIp, assertSafeHostname, safeFetch)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Guard `/api/urls` POST at add-time (TDD)

**Files:**
- Modify: `apps/web/app/api/urls/route.ts`
- Create: `apps/web/app/api/urls/route.test.ts`

**Interfaces:**
- Consumes: `assertSafeHostname`, `SsrfError` from `@/lib/security/ssrf`; existing `createServerClient` from `@/lib/supabase/server`.
- Produces: POST returns 422 `{ error: 'unsupported_host' }` for internal hosts, before any DB access.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/urls/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser }, from }),
  createServiceClient: () => ({ from }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))

import { POST } from './route'

function call(url: string) {
  return POST(new Request('http://localhost/api/urls', {
    method: 'POST',
    body: JSON.stringify({ url }),
    headers: { 'Content-Type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('POST /api/urls SSRF guard', () => {
  it.each([
    'http://localhost/',
    'http://169.254.169.254/',
    'https://192.168.0.1/',
    'http://foo.internal/',
  ])('rejects internal host %s with 422 and no DB access', async (url) => {
    const res = await call(url)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'unsupported_host' })
    expect(from).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated (guard does not mask auth)', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call('http://localhost/')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npm test -- api/urls/route.test`
Expected: FAIL — internal hosts currently pass the host check (no 422 path yet); `from` IS called (duplicate-check query runs).

- [ ] **Step 3: Add the guard to the route**

In `apps/web/app/api/urls/route.ts`, add the import near the top (after the `logActivity` import):
```ts
import { assertSafeHostname, SsrfError } from '@/lib/security/ssrf'
```
Then, immediately AFTER the `const normalized = ...` line (currently line ~33) and BEFORE the duplicate-check query, insert:
```ts
  // SSRF guard: reject internal/private hosts before any DB work.
  try {
    assertSafeHostname(parsed_url.hostname)
  } catch (e) {
    if (e instanceof SsrfError) {
      return NextResponse.json({ error: 'unsupported_host' }, { status: 422 })
    }
    throw e
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npm test -- api/urls/route.test`
Expected: PASS (4 internal hosts → 422 with `from` untouched; unauth → 401).

- [ ] **Step 5: Type-check and commit**

Run (from `apps/web`): `npm run type-check` → no errors.
```bash
git add apps/web/app/api/urls/route.ts apps/web/app/api/urls/route.test.ts
git commit -m "feat(web): reject internal hosts at URL add-time (SSRF S1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Route `/api/verify` through `safeFetch` + pre-check (TDD)

**Files:**
- Modify: `apps/web/app/api/verify/route.ts`
- Create: `apps/web/app/api/verify/route.test.ts`

**Interfaces:**
- Consumes: `assertSafeHostname`, `SsrfError`, `safeFetch` from `@/lib/security/ssrf`.
- Produces: verify returns 422 `{ error: 'unsupported_host' }` for internal hosts; uses `safeFetch` for all outbound verification requests.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/verify/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const single = vi.fn()
const update = vi.fn()
const logActivity = vi.fn()
const assertSafeHostname = vi.fn()
const safeFetch = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ single }) }) }) }) }),
  }),
  createServiceClient: () => ({
    from: () => ({ update: (...a: unknown[]) => { update(...a); return { eq: () => Promise.resolve({}) } } }),
  }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }))
vi.mock('@/lib/security/ssrf', () => ({
  SsrfError: class SsrfError extends Error {},
  assertSafeHostname: (...a: unknown[]) => assertSafeHostname(...a),
  safeFetch: (...a: unknown[]) => safeFetch(...a),
}))

import { POST } from './route'
import { SsrfError } from '@/lib/security/ssrf'

function call() {
  return POST(new Request('http://localhost/api/verify', {
    method: 'POST',
    body: JSON.stringify({ url_id: '11111111-1111-1111-1111-111111111111', method: 'file' }),
    headers: { 'Content-Type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  single.mockResolvedValue({ data: {
    id: 'url-1', url: 'https://example.com', verification_token: 'vc-verify=tok', verified: false,
  } })
  assertSafeHostname.mockReturnValue(undefined)
})

describe('POST /api/verify SSRF guard', () => {
  it('returns 422 unsupported_host when the host is blocked', async () => {
    assertSafeHostname.mockImplementation(() => { throw new SsrfError('blocked') })
    const res = await call()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'unsupported_host' })
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('verifies via safeFetch when the file matches the token', async () => {
    safeFetch.mockResolvedValue({ ok: true, text: async () => 'vc-verify=tok' })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ verified: true })
    expect(safeFetch).toHaveBeenCalledWith(
      'https://example.com/.well-known/vibe-check-verify.txt',
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(update).toHaveBeenCalled()
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'url_verified' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npm test -- api/verify/route.test`
Expected: FAIL — `safeFetch`/`assertSafeHostname` not used by the route yet (route still calls global `fetch`; no 422 path).

- [ ] **Step 3: Modify the verify route**

In `apps/web/app/api/verify/route.ts`:

(a) Add the import after the `logActivity` import:
```ts
import { assertSafeHostname, safeFetch, SsrfError } from '@/lib/security/ssrf'
```

(b) Replace `fetch(` with `safeFetch(` in BOTH `checkFile` and `checkMeta` (the two outbound requests). The surrounding `try/catch` and `AbortSignal.timeout` arguments stay unchanged.

(c) After `const domain = new URL(urlRow.url).hostname` (line ~80), insert the pre-check before the method dispatch:
```ts
  try {
    assertSafeHostname(domain)
  } catch (e) {
    if (e instanceof SsrfError) {
      return NextResponse.json({ error: 'unsupported_host' }, { status: 422 })
    }
    throw e
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npm test -- api/verify/route.test`
Expected: PASS (422 on blocked host with no `safeFetch`; verified:true path calls `safeFetch` with the well-known URL, updates, and logs).

- [ ] **Step 5: Type-check and commit**

Run (from `apps/web`): `npm run type-check` → no errors.
```bash
git add apps/web/app/api/verify/route.ts apps/web/app/api/verify/route.test.ts
git commit -m "feat(web): route verification fetches through safeFetch + host pre-check (SSRF S1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Final verification + docs

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Full type-check + build + tests**

Run (from `apps/web`):
```bash
npm run type-check && npm run build && npm test
```
Expected: type-check clean; build succeeds; all test files pass (ssrf, api/urls/[id], api/urls/route, api/verify/route).

- [ ] **Step 2: Manual smoke (dev server)**

Run `npm run dev`, sign in, go to onboarding/add-URL:
1. Add `https://169.254.169.254/` → request returns 422 `unsupported_host` (URL not added).
2. Add a normal public URL → adds fine; DNS verify still works against a real site.
Expected: both behave as described.

- [ ] **Step 3: Update PROJECT_STATUS.md**

In the Security findings table, change S1's row to mark it remediated, e.g. prefix the finding with `**[FIXED 2026-06-19]**` and a one-line note: "private-IP/host blocklist enforced via `lib/security/ssrf.ts` (`safeFetch` validating-dispatcher) at both `/api/verify` and `/api/urls` POST." Keep the row for history (consistent with how S4 records remediated items).

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: mark SSRF finding S1 remediated

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
