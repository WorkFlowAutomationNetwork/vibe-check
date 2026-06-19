# Design: SSRF protection for server-side verification fetches (S1)

**Date:** 2026-06-19
**Status:** Approved (design)
**Addresses:** `PROJECT_STATUS.md` → Security findings S1 (Medium).

---

## Problem

`/api/verify` proves URL ownership by fetching the user's site server-side:
`checkFile` GETs `https://<domain>/.well-known/vibe-check-verify.txt` and `checkMeta`
GETs `https://<domain>/`. `<domain>` is derived from a URL the user added via
`/api/urls`, which validates only `z.string().url()` — no host restriction. A user
can therefore add `https://169.254.169.254/` (cloud metadata), `https://192.168.1.1/`,
`https://localhost/`, etc. and cause the server to issue requests to internal or
cloud-metadata endpoints (SSRF).

Two amplifiers any real fix must address:
- **Redirects.** `fetch` follows redirects by default, so a *public* host can `302`
  to an internal IP.
- **DNS rebinding / TOCTOU.** Validating a hostname and then fetching by name lets DNS
  resolve to a different (internal) address at connect time.

The onboarding UI previously implied "localhost/private IPs not supported" but nothing
enforced it. The scanner-side `consent.verify` gate does **not** cover these web-app
fetches.

## Goals

1. No server-side verification fetch ever connects to a private/reserved IP — including
   via redirects and including the DNS-rebinding window.
2. Reject obviously-internal URLs at add-time with a clear message (defense in depth +
   UX), so users get immediate feedback rather than a silent verification failure.
3. Legitimate verification (including normal apex→www redirects) keeps working.

## Decisions (locked)

- **Undici validating dispatcher.** A shared `safeFetch` uses a custom `undici` `Agent`
  whose `connect.lookup` resolves the host and refuses any private/reserved IP. undici
  connects to the exact address the lookup returns, so the IP we validate *is* the IP
  connected to (closes TOCTOU), and every redirect hop opens a new connection through
  the same validating lookup. Add `undici` as an explicit dependency.
- **Enforce at both layers.** Full IP-validating `safeFetch` in `/api/verify`, plus a
  cheap synchronous hostname guard in `/api/urls` POST.

---

## Components

### 1. `apps/web/lib/security/ssrf.ts` (new)

The single source of truth for "is this host safe to fetch server-side."

```ts
export class SsrfError extends Error {}
```

**`isPrivateIp(ip: string): boolean`** — true for reserved/private addresses.
- IPv4 blocked CIDRs: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10` (CGNAT),
  `127.0.0.0/8`, `169.254.0.0/16` (link-local incl. metadata), `172.16.0.0/12`,
  `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`,
  `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4` (multicast),
  `240.0.0.0/4` (reserved), `255.255.255.255/32`.
- IPv6 blocked: `::1` (loopback), `::` (unspecified), `fc00::/7` (ULA),
  `fe80::/10` (link-local), `ff00::/8` (multicast), `2001:db8::/32` (doc).
- IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is unwrapped and re-checked as IPv4.

**`assertSafeHostname(hostname: string): void`** — synchronous, no DNS. Throws
`SsrfError` when the host is:
- empty;
- an exact blocked name: `localhost`, `metadata`, `metadata.google.internal`;
- a suffix match: `.localhost`, `.local`, `.internal`;
- an IP literal (`net.isIP`) that `isPrivateIp`. (Strips surrounding `[]` for IPv6.)

**`validatingLookup(hostname, options, callback)`** — the undici lookup. Calls
`dns.lookup(hostname, { all: true, verbatim: true }, …)`; on error → `callback(err)`;
if **any** resolved address `isPrivateIp` → `callback(new SsrfError(...))`; else
returns the first address: `callback(null, addresses[0].address, addresses[0].family)`.
Exported separately so it is unit-testable with a mocked `dns.lookup`.

**`safeFetch(url: string, init?: RequestInit): Promise<Response>`** — `import { Agent,
fetch as undiciFetch } from 'undici'`. Module-level singleton
`new Agent({ connect: { lookup: validatingLookup } })`. Runs `assertSafeHostname` on the
URL's hostname first (fast reject + clear error for literals/names), then
`undiciFetch(url, { ...init, dispatcher: agent })`. Importing undici's `fetch` (not the
global) gives correct typing for the `dispatcher` option. Redirects use undici's default
`follow`; each hop is validated by the same dispatcher.

### 2. `apps/web/app/api/verify/route.ts` (modify)

- `checkFile`/`checkMeta` call `safeFetch(...)` instead of `fetch(...)`, keeping the
  existing `AbortSignal.timeout` values (5000 / 8000 ms).
- Before dispatching the method (after computing `domain`), call
  `assertSafeHostname(domain)` inside a try/catch. On `SsrfError`, return **422**
  `{ error: 'unsupported_host' }` (an internal host can never be owned, and this also
  guards URLs added before the POST-layer check existed).
- A `SsrfError` thrown from inside `safeFetch` during a check is already caught by each
  check function's existing `try/catch`, which returns `false` (verification fails
  safely). The explicit pre-check gives the clearer 422.

### 3. `apps/web/app/api/urls/route.ts` (modify)

After URL normalization (line ~33), call `assertSafeHostname(parsed_url.hostname)` in a
try/catch. On `SsrfError`, return **422** `{ error: 'unsupported_host' }` before any DB
work. This rejects internal URLs at add-time with immediate feedback. (Full DNS
validation is intentionally *not* done here — DNS can change before verify runs; the
authoritative guard is `safeFetch` at fetch time. This layer is cheap UX + literal
blocking.)

---

## Error handling

| Condition | Where | Result |
|---|---|---|
| Internal host literal / blocked name at add | `/api/urls` POST | 422 `{ error: 'unsupported_host' }` |
| Internal host at verify (pre-check) | `/api/verify` | 422 `{ error: 'unsupported_host' }` |
| Host resolves to private IP at fetch | `safeFetch` lookup | `SsrfError` → check returns `false` → `{ verified: false }` |
| Redirect to private IP | dispatcher on redirect hop | connection refused → check returns `false` |

No raw fetch errors or resolved IPs are surfaced to the client.

## Testing

Uses the `apps/web` vitest harness (added 2026-06-19).

`apps/web/lib/security/ssrf.test.ts`:
- `isPrivateIp`: table of blocked addresses (`10.0.0.1`, `127.0.0.1`, `169.254.169.254`,
  `192.168.1.1`, `172.16.0.1`, `::1`, `fc00::1`, `fe80::1`, `::ffff:127.0.0.1`) → true;
  public addresses (`8.8.8.8`, `1.1.1.1`, `93.184.216.34`, `2606:2800:220:1::`) → false.
- `assertSafeHostname`: throws `SsrfError` for `localhost`, `LOCALHOST`,
  `foo.internal`, `x.local`, `metadata.google.internal`, `127.0.0.1`, `[::1]`, ``;
  does not throw for `example.com`, `8.8.8.8`.
- `validatingLookup` (mock `dns.lookup`): resolves all-public → `callback(null, addr,
  family)`; any-private in the set → `callback(SsrfError)`; dns error → `callback(err)`.

`apps/web/app/api/urls/[id]/route.test.ts` style is the model for route tests. Add:
- `apps/web/app/api/urls/route.test.ts`: POST with an internal-host URL (mock auth) →
  422 `unsupported_host`, and asserts no insert occurs. (This is the POST route's first
  test; the broader POST-coverage backfill remains its own tracked gap.)
- `apps/web/app/api/verify/route.test.ts`: mock `@/lib/security/ssrf` so
  `assertSafeHostname` throws → 422 `unsupported_host`; and a safe host where a mocked
  `safeFetch` returns the token → `{ verified: true }` with the service-client update +
  `url_verified` activity logged.

`safeFetch`'s live network behaviour is covered indirectly: `assertSafeHostname` and
`validatingLookup` (the actual blocking logic) are unit-tested directly; the dispatcher
wiring is thin glue.

### Verification before completion

`npm run type-check`, `npm run build`, `npm test` all green. Manual: add
`https://169.254.169.254/` → 422 at add-time; add a normal public URL → adds fine and
verify still works against a real site.

## Dependencies

Add `undici` to `apps/web` `dependencies` (`^6` to match the version bundled with
Next 14; it is already present transitively). Server-only import in route handlers
(Node runtime — confirmed, no `export const runtime = 'edge'` anywhere in `app/api`).

## Out of scope

- Re-verification / re-checking ownership over time (that's S3, separate).
- Applying SSRF guards to the scanner service (it has its own `consent.verify`; the
  scanner deliberately fetches user sites and runs in an isolated environment).
- A user-facing allowlist of scanner IPs (already covered by `/trust`).
