# Rate-Limit Discovery Fix & Honest Active-Scan Reporting — Design

**Status:** Approved for planning.

## Background

A real deep scan of `bathroomhealthos.com` (scan `cfda5237-9c0e-4f71-8ef5-dc8808d839da`) showed a green "✓ Authentication Review" badge in the report, implying the auth/rate-limit probe ran and the site was checked. In reality `RateLimitScanner.run()` returned `[]` — no finding was ever written, because it never found a login endpoint to probe. Direct inspection of the live site found the actual cause:

- The homepage has no `<form>`, only a nav link `<a href="/portal/login">Log in</a>`. `RateLimitScanner` only inspects the homepage itself plus a fixed list of generic guessed paths (`/login`, `/signin`, `/api/auth/login`, `/api/login`, `/auth/login`, `/api/auth/signin`) — `/portal/login` isn't on that list, so it's never visited.
- `/portal/login` *does* have a real `<form>` with a password input — but the form has no `action` attribute (`<form noValidate="" style="...">`), a common pattern for React/Next.js apps that submit via `onSubmit`/`fetch()` rather than a native form POST. The scanner's regex requires a captured `action="..."` to know what to POST to, so even a correctly-discovered page yields nothing today.
- Investigating further (fetching the page's JS chunk directly) confirmed there's no plain-text endpoint to recover here either — no inline `<script>` calls, and the dedicated bundle for that route is a small, minified chunk with no identifiable API path. The real submit logic likely goes through a shared SDK (e.g. Supabase Auth calling Supabase's own API directly from the browser) rather than the target's own backend at all. **This rules out "grep the JS bundles for the real endpoint" as a fix for this case** — it's not worth building that complexity for an unproven payoff.

Investigating the report UI side surfaced a second, related problem: the "Active scans in this report" badges (`StackUpgradeBlock.tsx`) are a **static catalogue** — they show a green checkmark for Database Exposure / Secrets Exposure / Authentication Review on every active/deep scan, regardless of whether the underlying scanner found anything to test. Auditing all three scanners' code found **seven** distinct places where a scanner has nothing to test and silently returns `[]` (no Finding row at all):

| Scanner | Silent-empty case |
|---|---|
| `RateLimitScanner` | No login endpoint discoverable at all |
| `SupabaseExposureScanner` | No Supabase credentials found in the page/JS at all |
| `SupabaseExposureScanner` | Credentials found, but zero tables confirmed to exist (even after the common-name guess fallback) |
| `StorageExposureScanner` | No Supabase credentials found in the page/JS at all |
| `StorageExposureScanner` | Credentials found, but the bucket-list call returned nothing usable |
| `StorageExposureScanner` | Buckets found, but all are marked `public` (nothing private to test) |
| `RateLimitScanner` (new, post-fix) | A login form is found but its real submit target can't be determined |

A customer paying for "we check your database/auth for leaks" deserves to see *some* line for each of these, not a checkmark indistinguishable from "checked, and you're clean."

## Scope

This spec covers two related fixes, shipped together because they address the same trust problem from two ends:

1. **`RateLimitScanner` discovery fix** — find more real login endpoints (like `/portal/login`), without expanding the worst-case request budget against the target site.
2. **Honest active-scan reporting** — every "active scan" scanner always emits at least one Finding, and the report UI badge reflects what actually happened (ran-and-found-something vs. ran-but-nothing-to-test vs. didn't-run-this-tier) instead of a blanket checkmark.

Out of scope: parsing/crawling JS bundles for endpoint hints (investigated and rejected above); any change to which tiers include which scanners; any change to `SupabaseExposureScanner`'s table-discovery logic itself (only its silent-empty paths get a Finding).

## Part 1 — `RateLimitScanner` Discovery Redesign

### Current behavior (and its latent bug)

`run()` iterates candidate paths and calls `_probe()` — which always sends the full `_N_ATTEMPTS = 8` POST requests — on *each* candidate in turn, stopping at the first one that isn't all-404. With 6 generic candidate paths today, the worst case (every guess returns something other than a hard 404, e.g. a catchall 405) is already up to **8 × 6 = 48 requests**, well past the "5–10 requests max" intent documented in the file's own docstring. This is a pre-existing issue, not introduced by this fix, but it must not get worse as more candidates are added — and the redesign below makes it strictly better.

### New design

**Step 1 — cheap discovery (1 GET per candidate, no POSTs yet):**

Build a candidate list in priority order:
1. **Link-derived candidates** (new): parse `<a href="...">` tags from the already-fetched homepage HTML (the same `httpx.get(self.url, ...)` call `_candidate_endpoints()` already makes — no extra request). Keep links whose path contains `login`, `signin`, `sign-in`, or `auth` (case-insensitive), resolved to absolute same-origin URLs. Cap at **2** candidates.
2. **Generic guessed paths** (existing list, unchanged): the current 6 paths, tried only if no link-derived candidate works out.

For each candidate, in order:
- If it's a **link-derived candidate**: GET it. If the response is a hard 404, skip it. Otherwise search its HTML for a `<form>` containing a password input (reusing the existing `_FORM_RE`/`_PASSWORD_INPUT_RE` patterns). If no such form is found, skip it (the link wasn't actually a login page — false positive nav link, e.g. a "forgot password" link). If a form **is** found:
  - If the form has a captured `action` attribute, that resolved URL is the probe target.
  - If the form has no `action`, the **page's own URL** is the probe target (the agreed fallback — cheap, no extra requests, matches colocated page+handler patterns).
  - Stop here — this is the chosen target, proceed to Step 2.
- If it's a **generic guessed path**: GET it first (cheap existence check, new — today these are POSTed blind). If it's a hard 404, skip it. Otherwise, that path itself is the probe target (unchanged from today's behavior — these are API-route-shaped guesses, not pages expected to contain a form). Stop here.

If every candidate is exhausted with no target chosen, go to "No target found" below.

**Step 2 — the actual rate-limit probe (run exactly once, only on the chosen target):**

Unchanged from today: send `_N_ATTEMPTS = 8` POSTs with bogus credentials, check for `429`/`Retry-After` across the responses, emit the existing `pass` ("rate limiting enforced") or `medium` ("no rate limiting observed") Finding.

**Step 3 — when nothing conclusive comes out, say so (new):**

Two new `severity: "info"`, `check_name: "rate-limit-probe"` Findings, replacing today's silent `return []`:

- **No target found at all** (no link candidate had a form, no generic guess existed):
  > title: "No login endpoint found to test"
  > description: "We looked for a login form on the homepage and tried several common login paths, but didn't find one to test for rate limiting."
- **Target found but inconclusive** — this covers a same-URL fallback that doesn't behave like a real API endpoint, detected by: the response status is `200` *and* its `Content-Type` starts with `text/html` (i.e., POSTing just re-renders the page rather than hitting a JSON/redirect-style handler). In this case, skip the throttling check entirely and emit:
  > title: "Found a login form, but couldn't verify rate limiting"
  > description: "Found a login form, but couldn't determine where it actually submits to — common with apps where the browser calls a third-party auth provider (e.g. Supabase, Firebase) directly instead of the app's own backend. Rate limiting on that flow is outside what this scan can verify."

### Request budget

Worst case: 1 homepage GET (already happens) + 2 link-candidate GETs + 6 generic-path GETs + 8 POSTs on the winning candidate = **17 requests**, and only if every cheaper option fails first. Typical case (a real login page found on the first or second candidate) is far fewer — comparable to or better than today's typical case, and strictly bounded unlike today's actual worst case of 48+.

**Action:** update the budget comment in `rate_limit.py` and the corresponding line in `CLAUDE.md` (currently silent on this scanner's total request count) to state the real worst case (17) rather than the unenforced "5-10" aspiration.

## Part 2 — Honest Active-Scan Reporting

### Backend: every silent-empty path gets a Finding

Each of the seven cases listed in Background gets a `severity: "info"` Finding (reusing the scanner's existing `check_name` so the report-side matching in Part 2 needs no new lookup table), replacing `return []`:

- `SupabaseExposureScanner`, no credentials found: title "No Supabase backend detected", description explains this check only applies to Supabase-backed apps.
- `SupabaseExposureScanner`, credentials found but no tables confirmed: title "Found a Supabase backend, but couldn't confirm any readable tables", description notes RLS exposure couldn't be verified as a result.
- `StorageExposureScanner`, no credentials found: same wording pattern as above, storage-specific.
- `StorageExposureScanner`, no buckets listed: title "Found a Supabase backend, but no storage buckets were listable".
- `StorageExposureScanner`, all buckets public: title "All storage buckets found are public", description notes there was nothing private left to check.
- `RateLimitScanner`'s two new cases from Part 1.

All of these follow the existing `Finding` dataclass and its security invariant (counts/labels only, no raw response data) — none of the new copy includes anything beyond what's already aggregate-safe.

### Frontend: `StackUpgradeBlock.tsx` reflects real outcomes

Map each of the three `ACTIVE_SCANS` entries to the `check_name`(s) that represent it:

```ts
const CHECK_NAMES: Record<string, string[]> = {
  'Database Exposure': ['supabase-rls-exposure', 'supabase-storage-exposure'],
  'Secrets Exposure': ['exposed-secret', 'public-keys'],
  'Authentication Review': ['rate-limit-probe'],
}
```

For each entry, on a non-free scan:
- No finding in `findings` matches any of its check_names → tier didn't run this check (shouldn't happen once the backend fix ships and the tier includes the scanner, but keep the existing locked-icon fallback for safety) — render today's 🔒 style.
- A matching finding exists with `severity === 'info'` → render a neutral marker (grey "·" instead of green "✓"), with the finding's own `description` shown as supporting text under the blurb instead of the static catalogue blurb alone.
- A matching finding exists with any other severity → render the existing green "✓" (ran, produced a real result — good or bad is shown elsewhere in the Issues/Passed lists, this badge only answers "did it run").

On a free/passive scan, behavior is unchanged (locked 🔒, "Active scans available").

## Testing

**`apps/scanner/tests/test_rate_limit.py`** (extends existing tests):
- Link-derived candidate discovery: homepage HTML with `<a href="/portal/login">`, mocked GET to that page returning a password-input form with no `action` → asserts the POST battery targets the page's own URL.
- Link-derived candidate with an `action` present → asserts the POST battery targets the resolved action URL, not the page URL.
- A login-ish link that turns out to have no form on it (false-positive nav link) → asserts it's skipped and the next candidate (or generic fallback) is tried.
- Generic-path fallback still works when no link candidate is found (regression coverage for existing behavior, now behind a discovery GET).
- "No target found at all" → asserts the new info Finding, exact title.
- "Target found, response looks like the page re-rendering" (200 + `text/html`) → asserts the second new info Finding, and that no throttling check / no pass-or-medium Finding is emitted in this case.
- Request-count assertion: construct a worst-case scenario (all candidates 404 except the very last) and assert the total mocked call count matches the documented worst case, not the old unbounded behavior.

**`apps/scanner/tests/test_supabase_exposure.py` / `test_storage_exposure.py`** (extend existing):
- One new test per silent-empty case (5 across both files) asserting the new info Finding's `check_name` and `severity`.

**`apps/web`** (no existing test runner per `package.json` — confirmed no `test` script exists): type-check (`npm run type-check`) covers `StackUpgradeBlock.tsx`'s new logic compiling correctly. Manual verification: re-run the deep scan that started this investigation (or a fresh one against a similar target) and visually confirm the badge now shows the neutral marker rather than a green check for the Authentication Review row, given that finding will be the new "info" case.

## Non-goals / explicitly deferred

- JS-bundle parsing for endpoint discovery (investigated, rejected — see Background).
- Broader same-origin crawling beyond the homepage's own links (rejected in favor of the bounded link-extraction approach).
- Any change to which scan tier includes which scanner.
- Retroactively re-running old scans to backfill the new info Findings on existing reports (out of scope; only affects newly-run scans going forward).
