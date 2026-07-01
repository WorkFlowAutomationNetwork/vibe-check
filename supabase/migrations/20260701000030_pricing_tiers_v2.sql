-- ============================================================
-- Pricing rework (2026-07-01): $15 one-off Starter / $35 Monitor
-- ============================================================
-- New entitlements:
--   free     -> 1 URL, 1 successful scan per calendar month, passive only
--   starter  -> 1 URL, 1 successful scan total, no integrations, badge 30d,
--               plan itself expires 30 days after purchase (reverts to free)
--   monitor  -> 5 URLs, 5 repos, full integrations, unlimited scans
--
-- Also fixes a latent RLS bug found while wiring this up: `urls` and `scans`
-- each had two PERMISSIVE insert policies. Postgres OR's permissive policies
-- together for the same command, so a row only needed to satisfy ONE of the
-- two checks -- meaning a `urls` insert with the default monitoring_mode
-- ('one_off') always passed the second policy unconditionally and the
-- can_add_url() limit was never actually enforced. Merged each pair into a
-- single policy with AND semantics so all conditions are required.

-- ============================================================
-- 1. Schema additions
-- ============================================================
alter table public.profiles add column plan_expires_at timestamptz;
alter table public.plan_limits add column max_repos int;

update public.plan_limits set max_urls = 1, max_scans_per_month = 1, max_repos = 0 where plan = 'free';
update public.plan_limits set max_urls = 1, max_scans_per_month = 1, max_repos = 0 where plan = 'starter';
update public.plan_limits set max_urls = 5, max_scans_per_month = null, max_repos = 5 where plan = 'monitor';

-- ============================================================
-- 2. user_plan() becomes expiry-aware: an expired starter plan
--    reads back as 'free' everywhere without needing a cron to
--    physically rewrite profiles.plan (same pattern as badge_status).
-- ============================================================
create or replace function public.user_plan()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select case
        when p.plan = 'starter'
         and p.plan_expires_at is not null
         and p.plan_expires_at < now()
        then 'free'
        else p.plan
      end
      from public.profiles p
      where p.id = auth.uid()
    ),
    'free'
  );
$$;

-- ============================================================
-- 3. Scan-count window: calendar month for free, the single
--    30-day purchase window for starter (their whole plan
--    lifetime), unused for monitor (unlimited).
-- ============================================================
create or replace function public.user_period_start()
returns timestamptz
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.user_plan() = 'starter' then
      (select p.plan_expires_at - interval '30 days' from public.profiles p where p.id = auth.uid())
    else
      date_trunc('month', now())
  end;
$$;

create or replace function public.scans_used_this_period()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.scans s
  where s.user_id = auth.uid()
    and s.status = 'completed'
    and s.created_at >= public.user_period_start();
$$;

-- ============================================================
-- 4. Guard: can the current user run (insert) another scan?
--    Only *completed* scans count -- a failed attempt doesn't
--    burn the allowance, so a flaky target or scanner timeout
--    doesn't cost a paying Starter customer their one scan.
-- ============================================================
create or replace function public.can_run_scan()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin()
    or (
      select
        pl.max_scans_per_month is null
        or public.scans_used_this_period() < pl.max_scans_per_month
      from public.plan_limits pl
      where pl.plan = public.user_plan()
    );
$$;

-- ============================================================
-- 5. Fold can_run_scan() into the existing scan-type policy
--    (merged, not a second permissive policy -- see header note).
-- ============================================================
drop policy if exists "enforce scan type on insert" on public.scans;
create policy "enforce scan type on insert"
  on public.scans for insert
  with check (
    auth.uid() = user_id
    and public.can_run_scan_type(scan_type)
    and public.can_run_scan()
  );

-- ============================================================
-- 6. Fold the url-limit and monitoring-mode checks into a single
--    policy (fixes the OR-semantics bug described in the header).
-- ============================================================
drop policy if exists "enforce url plan limit on insert" on public.urls;
drop policy if exists "enforce monitoring mode on url insert" on public.urls;
create policy "enforce url plan limit on insert"
  on public.urls for insert
  with check (
    auth.uid() = user_id
    and public.can_add_url()
    and (monitoring_mode = 'one_off' or public.can_use_monitoring())
  );

-- ============================================================
-- 7. Entitlements view: add scan-usage and repo-usage fields so
--    the app can show "1/1 scans used" etc. without extra round trips.
--    Repo writes happen via the service role (see github_repos
--    migration comment) so there's no RLS guard to add for repos --
--    the app checks max_repos/repo_count from this view before upserting.
-- ============================================================
create or replace view public.my_entitlements as
select
  public.user_plan()                            as plan,
  public.is_admin()                             as is_admin,
  public.can_add_url()                          as can_add_url,
  public.user_url_count()                       as url_count,
  (select max_urls     from public.plan_limits where plan = public.user_plan()) as max_urls,
  (select max_scans_per_month from public.plan_limits where plan = public.user_plan()) as max_scans_per_month,
  (select allowed_scan_types  from public.plan_limits where plan = public.user_plan()) as allowed_scan_types,
  public.can_use_monitoring()                   as can_monitor,
  public.can_use_badge()                        as can_badge,
  public.can_use_integrations()                 as can_integrations,
  public.can_run_scan()                         as can_run_scan,
  public.scans_used_this_period()               as scans_used_this_period,
  (select max_repos from public.plan_limits where plan = public.user_plan()) as max_repos,
  (
    select count(*)::int from public.repos r
    where r.user_id = auth.uid() and r.status = 'active'
  )                                              as repo_count,
  (select plan_expires_at from public.profiles where id = auth.uid()) as plan_expires_at;
