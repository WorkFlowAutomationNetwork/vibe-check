# Report Reframe — Sprint 1 Design

## Context

Following a product review on 2026-06-16 (logged in `PROJECT_STATUS.md`'s "What to Build Next" section), the team converged on a roadmap to make Vibe-Check's free report feel less punitive and more like a credible "we find what AI coding tools accidentally leak" product. Sprint 1 covers the reporting/UI work that needs no new scanners: severity relabeling, an Impact field per finding, a positive-findings section, a tech/stack disclosure check (closing existing Known Issue #2), and a "Detected Stack" + "Active Scans Available" block on the free report.

Sprint 2 (secrets scanner, Supabase Storage exposure) and Sprint 3 (rate-limit probe, integrations) are separate, later specs.

## Goal

Make the free passive-scan report feel substantive and trustworthy, and give free users a concrete, honest reason to upgrade — without overstating severity, without advertising scans that don't exist yet, and without any new scanner execution risk.

## Current state (verified against codebase)

- `findings.severity` DB constraint: `critical | medium | low | info | pass`. **No "high" tier exists or is used anywhere.**
- `Finding` dataclass (`apps/scanner/scanners/base.py`): `check_name, severity, category, title, description, what_we_did, remediation`. No `impact` field.
- `FindingsList.tsx` already renders "What it is" (description), "What we did" (what_we_did), "Recommended fix" (remediation) in an expandable card — this is more built than the original feedback assumed.
- `findings` table already has an unused `metadata jsonb` column.
- Known Issue #2 (already logged) specs a header-only tech-disclosure check that doesn't exist yet.
- No "high" severity findings are emitted by any scanner (`headers.py`, `tls.py`, `supabase_exposure.py`).

## Decisions made during brainstorming

1. **No new "high" severity value.** Display-layer relabeling only: `critical`→"Critical Risk", `medium`→"Configuration Improvement", `low`/`info`→folded into "Configuration Improvement" (secondary/minor), `pass`→"Passing Checks". DB enum, scanner code severities, and TypeScript types are unchanged.
2. **Add a real `impact` field** — new nullable `impact text` column on `findings`, new `impact: str` field on the `Finding` dataclass. Every existing finding construction gets an impact string.
3. **Positive findings get a new, dedicated UI block** (not just better styling of the existing inline pass rows).
4. **Stack detection is headers-only for Sprint 1.** Body/script scanning (e.g. detecting Supabase via a `*.supabase.co` reference) is explicitly out of scope — a fast-follow, not this sprint.
5. **"Active Scans Available" only advertises what's real today** — just "Database Exposure Check." Secrets Exposure gets added to this list as part of its own Sprint 2 task, not before the scanner ships. No "Authentication Review" or any other not-built category is advertised.

## A. Data & scanner changes

- **Migration:** add nullable `impact text` column to `public.findings`. No backfill — old rows render without an Impact line.
- **`scanners/base.py`:** add `impact: str` to the `Finding` dataclass. `to_dict()` (uses `asdict()`) automatically includes it, so the existing insert path in `jobs/tasks.py` needs no changes.
- **Every existing `Finding(...)` call site** in `headers.py`, `tls.py`, `supabase_exposure.py` gets an `impact=` string (mechanical edit, one line per finding, e.g. CSP-missing's impact: "An attacker who finds an XSS bug has fewer restrictions on what injected scripts can do").
- **New `_check_tech_disclosure()` in `headers.py`** (closes Known Issue #2): checks `x-powered-by`, `server`, `x-fah-adapter` headers against a small known-signature table (e.g. `"next.js"` → stack name `"Next.js"`, `"vercel"` → `"Vercel"`). On a match: `low`-severity finding, `category="headers"`, description includes the disclosed header/value, and `metadata={"header": <name>, "value": <raw value>, "stack_name": <mapped label>}`. No match / headers absent: `pass` finding, no metadata.

## B. Report UI — severity bucketing & positive findings

- **Relabeling only** in `FindingsList.tsx` (`SEV_LABEL`/`SEV_CLASS` maps), the report page's grade-summary rows, and the public report page's severity color/label maps. Underlying `severity` values and counts logic untouched — only display strings and visual grouping change.
- **Impact block:** `FindingsList.tsx`'s expanded finding view gets a new "Impact" block, shown between "What it is" and "What we did", rendered only when `finding.impact` is truthy (graceful for pre-migration rows).
- **New `components/report/PositiveFindings.tsx`:** pure presentational component. Takes the `pass`-severity findings from the parent, renders a compact ✓-prefixed list of their titles. Placed on the authenticated report page (`app/(app)/report/[scanId]/page.tsx`) between the grade card and `FindingsList`.
- **Public report page** (`app/(app)/report/[scanId]/public/page.tsx`) gets the same severity relabeling and the same positive-findings checklist (showing off clean results suits a shareable report), but does **not** get the Detected Stack / Active Scan Teaser blocks from section C.

## C. Detected Stack & Active Scans Available

- **`DetectedStack.tsx`** (`components/report/`): reads `metadata?.stack_name` off any finding with `check_name === "tech-disclosure"`, renders chips for each unique stack name found. Renders nothing if none detected — this is a bonus signal, not guaranteed on every scan.
- **`ActiveScanTeaser.tsx`** (`components/report/`): static content, one card today — "Database Exposure Check — verifies whether customer data can be accessed through your public Supabase API." (Secrets Exposure gets added here as its own task when that scanner ships in Sprint 2 — not before.)
- **Gating:** both components render only when `scan.scan_type === 'passive'`. Once a user has run an active/deep scan, they already have real Database Exposure results in their findings — re-advertising it would be redundant.
- **Placement:** `DetectedStack` near the existing scan metadata row (scan id / completed / mode) at the top of the report. `ActiveScanTeaser` after `FindingsList`, as a closing card.

## D. Testing & rollout

- **Scanner tests:** new tests for `_check_tech_disclosure()` — known header values produce the expected `low` finding + correct `metadata.stack_name`; absent/unknown headers produce a `pass` finding with no metadata. Existing tests in `tests/` that construct or assert on `Finding` literals get updated for the new required `impact` field.
- **Migration:** applied via Supabase migration tooling, same pattern as the existing 17 migrations in `supabase/migrations/`.
- **Web side:** no existing test files for report components (`FindingsList.tsx` etc. have none today) — consistent with that, this sprint relies on manual verification rather than introducing a new test pattern.
- **Manual verification:** run a passive scan against a real URL and confirm — severity labels read "Configuration Improvement" not "Medium"; Impact line appears in expanded findings; "What's working" checklist renders; Detected Stack chips appear if the target sends recognizable headers; Active Scan Teaser renders with Database Exposure copy only. Then run an active scan and confirm Detected Stack/Teaser are absent.
- **Rollout order:** migration (additive, safe) → scanner changes + tests → web UI changes. Each step is independently shippable and revertable.

## Explicitly out of scope for this spec

- Adding a "high" severity tier.
- Body/script-based stack detection (e.g. Supabase URL sniffing).
- Advertising Secrets Exposure or any not-yet-built scan category.
- Any change to scan-tier gating, consent flow, or active-scanner execution.
- Test coverage for report-layer React components (matches existing project convention of no tests there).
