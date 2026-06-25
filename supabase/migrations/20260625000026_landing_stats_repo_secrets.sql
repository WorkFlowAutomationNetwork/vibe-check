-- Extend get_landing_stats with GitHub committed-secret scanning counters:
-- repo_scans_run (count of completed repo scans, not distinct repos) and
-- secrets_found (total committed-secret findings across all scans).
-- Return type is changing, so the function must be dropped and recreated.

drop function if exists public.get_landing_stats();

create function public.get_landing_stats()
returns table (
  scans_run bigint,
  sites_checked bigint,
  avg_vulns numeric,
  repo_scans_run bigint,
  secrets_found bigint
)
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
    (select count(*)                from completed)::bigint as scans_run,
    (select count(distinct url_id)  from completed)::bigint as sites_checked,
    coalesce(round(avg(vulns), 1), 0)                       as avg_vulns,
    (select count(*) from public.repo_scans
       where status = 'completed')::bigint                  as repo_scans_run,
    (select count(*) from public.repo_findings)::bigint      as secrets_found
  from vuln_counts;
$$;

revoke all on function public.get_landing_stats() from public, anon, authenticated;
