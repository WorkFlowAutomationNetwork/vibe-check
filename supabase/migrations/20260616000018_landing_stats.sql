-- Migration 18: aggregate stats for the public landing page.
-- Single SECURITY DEFINER function returning all-time, cumulative counts over
-- completed scans. Called server-side via the service-role client (the marketing
-- page is unauthenticated and RLS would otherwise hide other users' scans).
-- Returns aggregate counts only — no row data is exposed. Not callable by
-- anon/authenticated clients via PostgREST.

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
    (select count(*)               from completed)::bigint as scans_run,
    (select count(distinct url_id)  from completed)::bigint as sites_checked,
    coalesce(round(avg(vulns), 1), 0)                       as avg_vulns
  from vuln_counts;
$$;

revoke all on function public.get_landing_stats() from public, anon, authenticated;
