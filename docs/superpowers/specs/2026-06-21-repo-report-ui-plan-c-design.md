# Repo report UI (GitHub committed-secret scanning — Plan C) — design

**Date:** 2026-06-21
**Status:** Approved design (pre-implementation)
**Scope:** `apps/web` only. No scanner changes, no new API routes, no new migration.
**Parent spec:** `docs/superpowers/specs/2026-06-20-github-committed-secret-scan-design.md` (§6 Report, §10 file map)
**Launch step:** ② Integrations — GitHub. Plan A (foundations) and Plan B (scanner) shipped;
this is the read/trigger UI that surfaces repo scans to the user.

---

## 1. Purpose

Plans A and B built everything except the surface the user actually looks at. The data
model (`github_installations`, `repos`, `repo_scans`, `repo_findings`, all RLS-protected),
the web enqueue/poll route (`POST`/`GET /api/repo-scans`), and the scanner job all exist.
Plan C adds the two pages that let a user see their connected repos, trigger a committed-
secret scan, and read the results:

- `/repos` — connected repositories with latest scan status and a "Scan now" action.
- `/repos/[repoId]` — a single repo's report: **Clean** / **N secrets exposed** headline,
  the scan mode that ran, findings grouped by severity (redacted), and past-scan history.

This is **purely read/trigger UI**. The backend contract and data model are locked; nothing
in this plan changes the scanner, the API routes, or the schema.

---

## 2. Out of scope

- Any scanner, API-route, or migration change. `POST`/`GET /api/repo-scans` (built in
  Plan B) is the only backend this UI talks to.
- A "scan oversight / here's exactly what we accessed" panel (parent spec §2 fast-follow).
- Push-event auto-triggering, email alerts, CVE matching, non-default branches (all parent
  spec §2).
- PDF export of repo reports (URL scans have PDFs; repo reports do not in v1).
- Repo reports have **no A–F grade** (parent spec §5) — status is clean vs exposed.

---

## 3. Architecture (Approach A — server pages + client islands)

Both pages are **server components** that fetch via the Supabase server client, exactly
like the existing `app/(app)/report/[scanId]/page.tsx`. Interactivity is isolated in a small
`'use client'` island, mirroring the existing `ScanPollingView` pattern used by URL scans:

- Server component fetches data (RLS scopes every query to the owner) and renders.
- The `ScanRepoButton` client island triggers a scan (`POST /api/repo-scans`), polls
  status (`GET /api/repo-scans?id=`), and calls `router.refresh()` when the scan reaches a
  terminal state so the server component re-renders with fresh data.

This keeps data access server-side and reuses the polling UX users already get on URL scans.

### Files

**Pages (server components):**
- `app/(app)/repos/page.tsx` — connected-repos list.
- `app/(app)/repos/[repoId]/page.tsx` — single repo report.

**Client island (`'use client'`):**
- `components/repos/ScanRepoButton.tsx`.

**Modified:**
- `components/shared/AppShell.tsx` — add `'repos'` to the `activeNav` union and a "Repos"
  sidebar nav entry (placed under "Reports").
- `components/integrations/GitHubCard.tsx` — repo names link to `/repos/[repoId]`; add a
  "View repos →" link to `/repos`.

**No** new API routes, migrations, or scanner changes.

### Styling

There is no design-mock HTML for these pages (`design/` has none for repos). Reuse the
existing design-system CSS variables and the visual language already established by the
URL report and integrations pages (cards with the `6px 6px 0 var(--ink)` shadow, severity
swatches/pills, the finding-row layout from `components/report/FindingsList`). No new global
CSS file is required beyond what the existing `(app)/app.css` provides; page-local styles
follow the existing inline-style + shared-class approach.

---

## 4. `/repos` — list page

Server component. Loads the user's active installation and active repos, plus the latest
`repo_scan` per repo (query `repo_scans` for the user ordered by `created_at desc`, then
reduce to the most recent per `repo_id` in code).

**States:**

- **Not connected** (no `github_installations` row with `status='active'`): a centered card —
  "Connect GitHub to scan your repositories for committed secrets" with a **Connect GitHub**
  button linking to `/api/integrations/github/install`. Copy consistent with the integrations
  GitHub card.
- **Connected, no active repos**: "No repositories selected" + a **Manage access** link to
  `/api/integrations/github/install`.
- **Connected with repos**: one card per active repo showing:
  - `full_name`, linking to `/repos/[repoId]`.
  - A **status pill** derived from the repo's latest scan:
    - no scan → **Never scanned** (grey/`--ink-mute`)
    - latest `pending`/`running` → **Scanning…** (violet)
    - latest `completed` & `secrets_found === 0` → **Clean** (green/`--lime-deep`)
    - latest `completed` & `secrets_found > 0` → **N secrets** (red/`--danger`)
    - latest `failed` → **Failed** (`--danger`)
  - Last-scanned relative time (`last_scan_at`) and the mode of the latest scan.
  - `<ScanRepoButton repoId activeScanId?>` — disabled and showing "Scanning…" while a scan
    is in flight for that repo.

---

## 5. `/repos/[repoId]` — report page

Server component. Loads:
- the repo by id, scoped to the user (RLS); `notFound()` if missing/not active.
- the repo's scan history (`repo_scans` where `repo_id = …` ordered `created_at desc`).
- the `repo_findings` for the latest **completed** scan (if any).

**Layout:**
- **Back link** → `/repos`.
- **Header**: `full_name`, the installation `account_login`, and `<ScanRepoButton>`.
- **Latest-scan state:**
  - *No scans yet* → empty state ("This repo hasn't been scanned yet") + Scan now.
  - *latest pending/running* → a "Scanning…" panel; `ScanRepoButton` receives the in-flight
    `activeScanId` so polling resumes immediately on load.
  - *latest failed* → danger panel ("Scan failed — try again"), mirroring the URL report's
    failed block.
  - *latest completed* → **headline**:
    - `secrets_found === 0` → green **"Clean"** — "No committed secrets found."
    - `secrets_found > 0` → red **"{n} secrets exposed"** + severity count chips
      (critical / medium / low).
- **Mode label** (for the latest completed scan): *Full history*, or *Incremental — {N}
  new commits since {date}* derived from `mode`, `commits_scanned`, and the previous scan's
  date.
- **Findings**, grouped by severity in order critical → medium → low → info. Each finding
  row shows: `title` (with `rule_id`), masked `match_preview` (monospace), `file_path`
  + `line_start`, short `commit_sha` + `commit_author` + `committed_at`, and `remediation`.
  Reuses the finding-row visual language from the URL report. Only redacted fields are shown
  (the schema stores no raw secret — parent spec §5).
- **Scan history**: a compact table of past scans — date, mode, `commits_scanned`,
  `secrets_found`, status.

**Error handling** matches the existing report page: `notFound()` for missing/unauthorized
repos; the failed-scan panel for failed scans; defensive null handling on optional fields
(`commit_author`, `committed_at`, `line_start`, `last_scan_at` are all nullable in the schema).

---

## 6. `ScanRepoButton` (client island)

Props: `repoId: string`, `activeScanId?: string`.

Behaviour:
- On mount, if `activeScanId` is set, immediately enter the polling state for it.
- On click: `POST /api/repo-scans` with `{ repo_id }`.
  - `202` → begin polling the returned `repo_scan_id`.
  - `409` (scan already in progress) → begin polling the `repo_scan_id` the route returns.
  - `502`/other error → show an inline error ("Couldn't start scan — try again").
- Polling: `GET /api/repo-scans?id=<id>` every ~3s. While `pending`/`running`, render a
  disabled "Scanning…" state. On `completed`/`failed`, stop polling and call
  `router.refresh()` so the server component re-renders with results.
- Clears its interval on unmount.

---

## 7. Testing (vitest)

- **ScanRepoButton:**
  - POST `202` → enters polling state.
  - POST `409` → resumes polling on the returned `repo_scan_id`.
  - terminal poll status (`completed`/`failed`) → calls `router.refresh()`.
  - POST `502` → shows the inline error.
  - `activeScanId` prop on mount → starts polling without a click.
- **/repos page:**
  - not connected → Connect CTA rendered.
  - connected + no repos → manage-access state.
  - connected + repos → rows render with the correct status pill derived from each repo's
    latest scan (cover clean, N-secrets, never-scanned, scanning).
- **/repos/[repoId]:**
  - completed `secrets_found === 0` → "Clean" headline.
  - completed `secrets_found > 0` → "{n} secrets exposed" + grouped findings.
  - mode label: full vs incremental.
  - failed latest scan → failed panel.
  - missing/unauthorized repo → `notFound()`.
- Server-component render tests follow the existing `app/prelaunch/page.test.tsx` /
  report-page approach (mock `@/lib/supabase/server`; `renderToStaticMarkup` encodes
  apostrophes — assert apostrophe-free substrings).

---

## 8. Components / file map

```
apps/web/
  app/(app)/repos/page.tsx                    ← new (list)
  app/(app)/repos/[repoId]/page.tsx           ← new (report)
  components/repos/ScanRepoButton.tsx         ← new (client island)
  components/shared/AppShell.tsx              ← modified (nav entry + activeNav 'repos')
  components/integrations/GitHubCard.tsx      ← modified (repo links + "View repos")
  + *.test.ts(x) alongside each new file
```

No backend, schema, or scanner changes.
