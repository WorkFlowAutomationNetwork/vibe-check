# Nuclei deep-tier scanner — design

**Date:** 2026-06-17
**Status:** Approved, ready for implementation plan

## Context

The Sprint 2-3 scanner roadmap (`PROJECT_STATUS.md`) lists "Nuclei / SQLi / XSS (deep tier)" as the last major scanner gap. CLAUDE.md names Nuclei, SQLmap, and DalFox as the deep-tier tool set, each invoked via subprocess with a fixed timeout (Nuclei 120s, SQLmap 90s, DalFox 60s).

These tools differ fundamentally from every scanner built so far: `HeadersScanner`, `TLSScanner`, `SupabaseExposureScanner`, `StorageExposureScanner`, `SecretsScanner`, and `RateLimitScanner` all make a small, fixed number of HTTP requests with predictable, bounded behavior. Nuclei runs thousands of community-maintained templates, some of which are intrusive (resource-registering takeover checks, fuzzers, DoS-adjacent probes). Running it against a paying customer's production site — even one that passed `consent.verify()` — requires deliberately narrowing what it's allowed to do.

This spec scopes **Nuclei only**. SQLmap and DalFox are explicitly deferred to their own future specs — they are actively exploitative (not just probing) and deserve a dedicated safety review rather than being bundled in here.

## Goals

- Add `NucleiScanner` to the scanner suite, following the existing `BaseScanner` interface (`scanners/base.py`).
- Run only a curated, safe subset of Nuclei's template library — never the full set.
- Map Nuclei's output into `Finding` objects without any DB schema changes.
- Keep the scanner non-fatal: any failure (binary missing, timeout, malformed output) degrades to an empty result, never a failed scan.
- Wire it into the `deep` tier only. This is the first scanner where `deep` actually differs from `active` — until now `deep = [*active]`.
- Make it fully testable without the `nuclei` binary installed (this repo is developed on a Windows box with no Nuclety/Go toolchain).
- Update the Fly.io deployment so the binary and a pinned template snapshot are baked into the image at build time.

## Non-goals

- SQLmap (SQL injection) and DalFox (XSS) — separate specs.
- Running Nuclei on `active`-tier scans.
- Any user-facing template selection/configuration (the safe tag set is fixed in code, not user-configurable).
- Auto-updating templates at runtime or on a schedule — template freshness is tied to deploys only.

## Template scope

Nuclei templates carry tag metadata maintained by the Nuclei project. The scanner runs with:

```
-tags cve,exposure,misconfig,default-login,tech
-etags dos,fuzz,intrusive
```

This is a curated **safe tag allowlist** — relying on Nuclei's own tag taxonomy rather than hand-maintaining a list of individual template IDs, which would require manual upkeep as the upstream template set evolves. `-etags` explicitly excludes denial-of-service-adjacent and fuzzing-style templates even if they'd otherwise match an included tag.

## Invocation

```
nuclei -u {url} -jsonl -silent -no-color \
  -tags cve,exposure,misconfig,default-login,tech \
  -etags dos,fuzz,intrusive \
  -timeout 10 -rate-limit 50
```

- `-jsonl` — one JSON object per line per match, written to stdout.
- `-timeout 10` — per-request timeout inside Nuclei (distinct from the outer subprocess timeout).
- `-rate-limit 50` — caps requests/sec Nuclei sends to the target, in keeping with CLAUDE.md's "politeness" expectations for scanner traffic.
- Outer call: `subprocess.run([...], capture_output=True, text=True, timeout=120)` — the 120s ceiling from CLAUDE.md's Python conventions section.

Each JSONL line of interest has roughly this shape (Nuclei's documented output format):

```json
{
  "template-id": "exposed-panel-grafana",
  "info": { "name": "Grafana Exposed Login Panel", "severity": "info", "description": "...", "remediation": "..." },
  "matched-at": "https://target.example.com/grafana/login"
}
```

## Severity and category mapping

`Finding.severity` (in `scanners/base.py`) is `critical | medium | low | info | pass` — there is no `high`. Nuclei's severity scale is `info | low | medium | high | critical`.

Mapping: **`high → critical`**. Nuclei reserves `critical` for things like unauthenticated RCE; its `high` tier (e.g. a confirmed CVE with real impact) is still serious enough to warrant the grader's `-25` deduction and the same urgency bar as the existing critical findings (Supabase RLS exposure, leaked secrets). `low`/`info`/`medium` pass through unchanged.

`Finding.category` has a fixed DB check constraint: `headers | transport | ai | auth | cors | deps | endpoints | secrets`. There's no generic "vulnerability" bucket and adding one means a migration plus touching the `public_findings` view. Decision: **every Nuclei finding uses `category="endpoints"`** — consistent with how the existing exposure scanners already use `endpoints` for "something reachable that shouldn't be." The template ID and title still distinguish individual findings within the report; category here is a coarse DB-level bucket, not the primary way users see findings split.

## Finding construction

For each parsed JSONL line:

- `check_name`: `f"nuclei-{template_id}"`
- `severity`: mapped per above
- `category`: `"endpoints"`
- `title`: `info.name`
- `description`: `info.description` (falls back to a generic "Nuclei template '{template_id}' matched" if absent)
- `what_we_did`: `f"Ran Nuclei template '{template_id}' against {matched_at}."`
- `remediation`: `info.remediation` if the template provides one, else a generic "Review this finding against the linked CVE/reference and apply the vendor's recommended fix."

If Nuclei runs cleanly and produces **no** matching lines: emit a single `pass` Finding — `check_name="nuclei-scan"`, title "No issues found by Nuclei's curated safe-template scan", description noting the tag scope used (so report readers understand what was and wasn't checked).

## Failure handling

All of the following degrade to `return []` (no finding, no exception) — consistent with the PDF renderer's "best-effort" pattern introduced earlier this sprint:

- `nuclei` binary not found / not executable (`FileNotFoundError`)
- subprocess timeout (120s exceeded) → `subprocess.TimeoutExpired`
- non-zero exit code with no parseable JSONL on stdout
- any line that fails `json.loads` is skipped individually (one bad line doesn't discard the rest)

This scanner runs alongside others in `_execute_scan`'s list comprehension (`jobs/tasks.py`) — an unhandled exception here would currently propagate and fail the *entire* scan (all scanners' findings lost), so internal resilience matters more for this scanner than any prior one, given Nuclei is the least predictable tool in the suite.

## Architecture

New file `apps/scanner/scanners/nuclei.py`:

```python
class NucleiScanner(BaseScanner):
    def run(self) -> list[Finding]:
        ...  # subprocess.run, parse JSONL, map to Finding list
```

Matches the existing `BaseScanner` ABC (`__init__(self, url, timeout=30)`, abstract `run()`) used by every other scanner — no interface changes needed.

## Testing strategy

`subprocess.run` is mocked at `scanners.nuclei.subprocess.run` (patched per-test, same approach `respx` plays for httpx-based scanners) returning a fake `subprocess.CompletedProcess` with canned JSONL `stdout`. No real `nuclei` binary is required to run the test suite — mirrors how `reports/renderer.py` defensively imports `weasyprint` so tests can mock around native-dependency gaps that don't exist on this Windows dev machine.

Cases to cover:
- One or more matches → corresponding `Finding`s, correct severity/category mapping (incl. `high → critical`).
- No matches, clean exit → single `pass` Finding.
- Binary missing (`FileNotFoundError`) → `[]`.
- Timeout (`subprocess.TimeoutExpired`) → `[]`.
- Malformed JSON on one line among otherwise-valid lines → that line skipped, others still parsed.
- Confirms the exact command-line flags passed to `subprocess.run` (tags/etags/rate-limit/timeout) so the safety scope can't silently drift.

## Tier wiring

`jobs/tasks.py::_scanners_for_tier`:

```python
deep = [*active, NucleiScanner]
```

This is the first time `deep` differs from `active`. The existing test `test_deep_tier_matches_active_tier` (`tests/test_tasks_tiers.py`) encodes the *old* invariant ("deep is currently a pure extension of active with no deep-only scanners") and will be removed/replaced with tier-inclusion tests for `NucleiScanner` specifically (passive/active exclude it, deep includes it) — matching the pattern used for every other scanner added this sprint.

## Deployment changes

`apps/scanner/Dockerfile` becomes a multi-stage build:

1. **Build stage** (`golang:1.22` or current stable): `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest`, then run `nuclei -update-templates` to pull the current community template set into that stage's filesystem.
2. **Final stage** (existing `python:3.12-slim` base): copy the compiled `nuclei` binary and the pulled templates directory from the build stage. No Go toolchain ships in the final image — keeps it slim.

Template freshness is now tied to redeploys: a new image build always bakes in whatever templates were current at build time. No runtime network call to update templates, no scheduled job. Redeploying picks up new templates — this is an explicit, reviewable action (a deploy), not something that silently changes scanner behavior in production between deploys.

## Open follow-ups (not in this scope)

- SQLmap and DalFox wrappers — separate specs, separate safety review.
- Whether to ever expose Nuclei's matched CVE/reference links directly in the report UI (currently folds into `description`/`remediation` text only).
- Per-customer template tag customization (e.g. letting Monitor-tier users opt into broader tags) — no current product requirement for this.
