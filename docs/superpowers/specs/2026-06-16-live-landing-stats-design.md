# Design — Live landing-page stats

**Date:** 2026-06-16
**Status:** Approved (pending spec review)

## Problem

The marketing landing page (`apps/web/app/(marketing)/page.tsx`) shows hardcoded
stats — `2,431` ("sites checked" / "scans run") and `6.2` ("avg vulnerabilities
found"). These should reflect real product data.

## Goals

Replace three hardcoded numbers with live, all-time aggregates:

| Location | Current | New (live) |
|---|---|---|
| Hero eyebrow (`page.tsx:33`) | `2,431 sites checked this week` | `<sitesChecked> sites checked` |
| Trust pill (`page.tsx:59`) | `2,431 scans run this week` | `<scansRun> scans run` |
| Trust pill (`page.tsx:60`) | `avg 6.2 vulnerabilities found` | `avg <avgVulns> vulnerabilities found` |

The `60s end-to-end` and `from $0` pills are fixed copy/pricing — **not** changed.

## Decisions (from brainstorming)

- **Cumulative, not weekly.** Show all-time totals; copy drops "this week".
- **No floors — fully honest.** Display true numbers even if small early. This is a
  security brand; integrity of the numbers matters more than looking big.
- **Hourly refresh** via Next.js ISR (`revalidate = 3600`). Near-zero DB load.
- **Three stats go live:** scans run, sites checked, avg vulnerabilities found.

## Aggregate definitions

All computed over **completed** scans only (`status = 'completed'`) — an unambiguous
"real scan":

- `scans_run` = count of completed scans.
- `sites_checked` = count of **distinct** `url_id` across completed scans.
- `avg_vulns` = mean, over completed scans, of the number of findings with
  `severity <> 'pass'` for that scan; rounded to 1 decimal. `0` when no scans.

## Architecture

### 1. Postgres RPC (new migration)

A single `SECURITY DEFINER` SQL function returns all three aggregates in one
round-trip. Chosen over (a) three supabase-js `count` queries — `COUNT(DISTINCT …)`
and avg-per-scan aren't expressible in the JS query builder; (b) a materialized view
— overkill for hourly refresh.

```sql
-- supabase/migrations/20260616000018_landing_stats.sql
create or replace function public.get_landing_stats()
returns table (scans_run bigint, sites_checked bigint, avg_vulns numeric)
language sql
stable
security definer
set search_path = public
as $$
  with completed as (
    select id, url_id from public.scans where status = 'completed'
  ),
  vuln_counts as (
    select c.id,
           count(f.*) filter (where f.severity <> 'pass') as vulns
    from completed c
    left join public.findings f on f.scan_id = c.id
    group by c.id
  )
  select
    (select count(*)              from completed)::bigint as scans_run,
    (select count(distinct url_id) from completed)::bigint as sites_checked,
    coalesce(round(avg(vulns), 1), 0)                       as avg_vulns
  from vuln_counts;
$$;

-- Not exposed via PostgREST to public clients; called server-side via service role.
revoke all on function public.get_landing_stats() from public, anon, authenticated;
```

### 2. Stats helper (`apps/web/lib/stats.ts`)

```ts
import { createServiceClient } from '@/lib/supabase/server'

export interface LandingStats {
  scansRun: number
  sitesChecked: number
  avgVulns: number
}

// Returns null on any error so the page can fall back gracefully.
export async function getLandingStats(): Promise<LandingStats | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('get_landing_stats').single()
    if (error || !data) return null
    return {
      scansRun: Number(data.scans_run),
      sitesChecked: Number(data.sites_checked),
      avgVulns: Number(data.avg_vulns),
    }
  } catch {
    return null
  }
}
```

The marketing page is unauthenticated; the anon key + RLS would hide other users'
scans, so the helper uses the **service-role** client (server-only). The function
returns aggregate counts only — no row data leaves the database.

### 3. Landing page changes (`apps/web/app/(marketing)/page.tsx`)

- Add `export const revalidate = 3600`.
- Make the component `async`; call `getLandingStats()`.
- Format integers with `toLocaleString('en-US')` (thousands separators); avg with
  `toFixed(1)`.
- Interpolate into the three locations above.

### Error / empty-data behavior

- Honest by default: real numbers render even if small (including `0`).
- **Hard-error fallback only:** if `getLandingStats()` returns `null` (RPC threw /
  unreachable), the page renders the *current hardcoded strings* so layout/SSR never
  breaks. This is a resilience fallback, not the normal display path.

## Out of scope

- Per-period ("this week") windows, charts, an admin stats dashboard.
- Floors / minimum-display logic (explicitly declined).
- Making the RPC publicly callable from the browser.

## Testing

- `lib/stats.ts`: unit test that a successful RPC maps fields correctly and that an
  error response yields `null`.
- Manual: load `/`, confirm three numbers render from real data and update within an
  hour of new completed scans; confirm fallback strings appear if the RPC is forced
  to error.
```
