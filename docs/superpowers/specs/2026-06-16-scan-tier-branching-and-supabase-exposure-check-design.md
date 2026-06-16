# Scan-tier branching + Supabase/PostgREST exposed-data check

**Date:** 2026-06-16
**Status:** Approved for implementation

## Context

Two related gaps were identified:

1. `apps/scanner/jobs/tasks.py::_execute_scan()` accepts a `scan_type` (`passive` | `active` | `deep`) but ignores it entirely — every scan, regardless of tier, runs the same two scanners (`HeadersScanner`, `TLSScanner`). Paid-tier scan types (`active`, `deep`) currently do nothing different from the free `passive` tier.
2. The product has no check for the CVE-2025-48757-style vulnerability (a Lovable-built app exposed all user data via Supabase's public REST API because RLS was never enabled) — despite this being exactly the kind of bug our target audience (vibe-coders shipping with Supabase) is most likely to ship, and despite an `endpoints` finding category already existing in `packages/shared/src/scan.ts` with no scanner implementing it.

These are addressed together because the new check is inherently "active" behavior (live endpoint probing, not passive header observation), making it the natural first scanner to gate behind the active/deep tier — which simultaneously gives `_execute_scan()` something real to branch on.

## Goals

- Make `scan_type` actually change scanner behavior: `passive` ⊂ `active` ⊂ `deep` (cumulative tiers).
- Detect publicly-readable Supabase tables (missing RLS) reachable via the target's own public anon key, without ever persisting actual row contents.
- Build the JS-bundle-fetching logic as a reusable utility, not a one-off, since the (separate, not-yet-built) `secrets.py` scanner will need the same fetch-and-scan-bundles capability later.

## Non-goals

- Building the full `secrets.py` / SecretFinder-style scanner (separate piece of future work; this design only produces the shared fetch utility it will eventually reuse).
- Nuclei/SQLmap/DalFox integration (`deep` tier remains functionally identical to `active` for now — this design just establishes the branching structure for those to slot into later).
- Wiring `scans.rate_limit_mode` ('polite'/'fast') into request pacing — not used by any existing scanner today; out of scope for this change. Flagged as a future improvement, not a shortcut taken here.

## Design

### 1. Tier branching in `jobs/tasks.py`

Replace the hardcoded scanner list with a cumulative tier map:

```python
SCANNERS_BY_TIER: dict[str, list[type[BaseScanner]]] = {
    "passive": [HeadersScanner, TLSScanner],
    "active":  [HeadersScanner, TLSScanner, SupabaseExposureScanner],
    "deep":    [HeadersScanner, TLSScanner, SupabaseExposureScanner],
}
```

`_execute_scan()` looks up `SCANNERS_BY_TIER[scan_type]`, instantiates each with `(url)`, and runs them as it does today. `TLSScanner` moves into `passive` itself (it was previously run unconditionally alongside `HeadersScanner` with no tier gating at all — this aligns it with CLAUDE.md's own description of passive scans as "headers, SSL, DNS").

`deep` is currently identical to `active`; this is intentional and documented inline as the seam for future intrusive scanners (Nuclei etc., tracked separately in `PROJECT_STATUS.md`).

### 2. Shared JS-bundle fetch utility: `apps/scanner/lib/js_extraction.py`

```python
def fetch_page_and_scripts(url: str, timeout: float, max_scripts: int = 10, max_bytes: int = 500_000) -> list[str]:
    """Fetch the page HTML plus same-origin <script src> bundles. Returns list of text blobs (HTML + each script body). Best-effort: network/parse failures are swallowed per-resource, not fatal to the caller."""
```

Implementation: `httpx.get` the page, parse `<script src="...">` tags (simple regex, no need for a full HTML parser dependency), resolve relative URLs against the page URL, fetch each script body up to `max_scripts`/`max_bytes` caps, return all text blobs (page HTML included, since keys are sometimes inlined directly rather than in an external bundle).

This is the only piece shared with the future `secrets.py` scanner — it owns fetching, callers own their own regexes.

### 3. New scanner: `apps/scanner/scanners/supabase_exposure.py`

```python
class SupabaseExposureScanner(BaseScanner):
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = self._extract_supabase_credentials(blobs)
        if not creds:
            return []  # not a Supabase app (or key not discoverable) — not applicable, no finding
        supabase_url, anon_key = creds
        tables = self._discover_tables(supabase_url, anon_key)
        return self._probe_tables(supabase_url, anon_key, tables)
```

- **`_extract_supabase_credentials`**: regex for `https://[a-z0-9]+\.supabase\.co` and a JWT-shaped string (`eyJ...`) appearing near it in the same blob. Returns `None` if either is missing.
- **`_discover_tables`**: `GET {supabase_url}/rest/v1/` with `apikey`/`Authorization: Bearer` headers set to the anon key; parses the returned OpenAPI `paths` keys as table names. Caps result at 50 tables (bounds request volume; documented constant, not a magic number).
- **`_probe_tables`**: for each table, `GET {supabase_url}/rest/v1/{table}?select=*&limit=1` with the same headers.
  - Request error / non-2xx / empty array (`[]`) → counts as "not exposed" for that table.
  - ≥1 row returned → records `(table_name, row_count)` only — **never row contents** — per CLAUDE.md's existing rule that scanner results are likelihood assessments, not stored payloads.
  - After probing all tables: if any exposed, emit one `critical` Finding per exposed table (title: `Supabase table '{table}' publicly readable without RLS`, description references table name + count only). If none exposed (but credentials were found and at least one table existed), emit a single `pass` Finding ("Supabase tables found, none publicly readable").
- Category: `endpoints` (existing `FindingCategory` value, currently unused by any scanner).
- Severity scheme matches your confirmed answer: critical only on actual rows returned; empty/inaccessible tables don't generate per-table noise; no key found means the check is silently not-applicable.

### 4. Testing

- `tests/test_supabase_exposure.py` (mirrors existing `httpx`-mocking style used elsewhere in `tests/`):
  - No Supabase URL/key in any blob → `run()` returns `[]`.
  - Key found, root schema returns tables, all probes return empty arrays → single `pass` Finding.
  - Key found, one table returns rows → one `critical` Finding, asserting the Finding's `description`/`what_we_did` contain only the table name and row count, never the row data structure.
  - Root schema request fails (network error) → returns `[]` gracefully (no exception propagates).
- `tests/test_js_extraction.py`: fetch utility correctly resolves relative script URLs, respects `max_scripts`/`max_bytes` caps, and tolerates a failing individual script fetch without aborting the whole call.
- Extend existing `tests/test_tasks.py`: assert `scan_type='passive'` instantiates exactly `[HeadersScanner, TLSScanner]`; assert `'active'` and `'deep'` additionally instantiate `SupabaseExposureScanner`.

## Open follow-ups (not part of this change, recorded for `PROJECT_STATUS.md`)

- `deep` tier has no scanners beyond `active` yet — Nuclei/SQLmap/DalFox integration remains separate future work.
- `rate_limit_mode` is not wired into any scanner's request pacing yet, including this new one.
- The full `secrets.py` JS-secrets scanner (AWS keys, Stripe tokens, etc.) is separate future work that will reuse `lib/js_extraction.py`.
