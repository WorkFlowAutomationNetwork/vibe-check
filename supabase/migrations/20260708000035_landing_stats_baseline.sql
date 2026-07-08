-- Migration 35: preserve landing-page stats across account deletion.
--
-- The homepage counters (get_landing_stats) are computed live from scans/
-- findings/repo_scans/repo_findings. Deleting accounts cascades away their rows,
-- which would drop the public "sites checked / scans run / secrets caught"
-- numbers. This adds a singleton `landing_stats_baseline` offset table that the
-- deletion tooling snapshots the to-be-deleted contribution into, and rewrites
-- get_landing_stats() to return baseline + live. The four counts offset exactly;
-- avg_vulns stays a true weighted average via a stored vuln_sum + scans_run.
--
-- Baseline is service-role-only (RLS on, no policies); the SECURITY DEFINER
-- function reads it regardless. A singleton row always exists (default 0s) so
-- the function never returns an empty row.

create table if not exists public.landing_stats_baseline (
  id             boolean primary key default true,
  scans_run      bigint not null default 0,
  sites_checked  bigint not null default 0,
  vuln_sum       bigint not null default 0,   -- total non-pass findings across baseline scans (for weighted avg)
  repo_scans_run bigint not null default 0,
  secrets_found  bigint not null default 0,
  updated_at     timestamptz not null default now(),
  constraint landing_stats_baseline_singleton check (id)
);

insert into public.landing_stats_baseline (id) values (true) on conflict (id) do nothing;

alter table public.landing_stats_baseline enable row level security;
revoke all on table public.landing_stats_baseline from anon, authenticated;

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
  ),
  live as (
    select
      (select count(*)              from completed)                              as scans_run,
      (select count(distinct url_id) from completed)                             as sites_checked,
      coalesce(sum(vulns), 0)                                                     as vuln_sum,
      (select count(*) from public.repo_scans where status = 'completed')        as repo_scans_run,
      (select count(*) from public.repo_findings)                                as secrets_found
    from vuln_counts
  ),
  b as (select * from public.landing_stats_baseline limit 1)
  select
    (b.scans_run      + l.scans_run)::bigint                                            as scans_run,
    (b.sites_checked  + l.sites_checked)::bigint                                        as sites_checked,
    coalesce(round((b.vuln_sum + l.vuln_sum)::numeric
                   / nullif(b.scans_run + l.scans_run, 0), 1), 0)                       as avg_vulns,
    (b.repo_scans_run + l.repo_scans_run)::bigint                                       as repo_scans_run,
    (b.secrets_found  + l.secrets_found)::bigint                                        as secrets_found
  from live l cross join b;
$$;

revoke all on function public.get_landing_stats() from public, anon, authenticated;
