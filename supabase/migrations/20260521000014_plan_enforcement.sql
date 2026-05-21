-- ============================================================
-- Plan limits & enforcement
-- ============================================================
-- Three plans + admin:
--   free     → 1 URL, passive scans only, no badge, no monitoring
--   starter  → 5 URLs, active+passive, badge (one-off), no continuous monitoring
--   monitor  → unlimited URLs, all scan types, badge (continuous), monitoring, integrations
--   admin    → no restrictions on anything (is_admin = true on profiles)

-- ============================================================
-- 1. Reference table: plan limits (used by UI and helper fns)
-- ============================================================
create table public.plan_limits (
  plan                text primary key,
  max_urls            int,          -- null = unlimited
  max_scans_per_month int,          -- null = unlimited
  allowed_scan_types  text[],       -- which scan_type values are allowed
  can_monitor         boolean not null default false,
  can_badge           boolean not null default false,
  can_integrations    boolean not null default false,
  can_api_access      boolean not null default false
);

insert into public.plan_limits values
  ('free',    1,    3,    array['passive'],                  false, false, false, false),
  ('starter', 5,    null, array['passive','active'],         false, true,  false, false),
  ('monitor', null, null, array['passive','active','deep'],  true,  true,  true,  true);

-- Read-only for authenticated users (UI reads this to show upgrade prompts)
alter table public.plan_limits enable row level security;

create policy "anyone can read plan limits"
  on public.plan_limits for select
  using (true);

-- ============================================================
-- 2. Helper: current user's plan
-- ============================================================
create or replace function public.user_plan()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select plan from public.profiles where id = auth.uid()),
    'free'
  );
$$;

-- ============================================================
-- 3. Helper: how many active (non-deleted) URLs this user has
-- ============================================================
create or replace function public.user_url_count()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.urls
  where user_id = auth.uid()
    and deleted_at is null;
$$;

-- ============================================================
-- 4. Guard: can the current user add another URL?
--    Admins always pass. Others checked against plan_limits.
-- ============================================================
create or replace function public.can_add_url()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    -- admins bypass everything
    public.is_admin()
    or (
      select coalesce(pl.max_urls, 2147483647) > public.user_url_count()
      from public.plan_limits pl
      where pl.plan = public.user_plan()
    );
$$;

-- ============================================================
-- 5. Guard: can the current user run a scan of this type?
-- ============================================================
create or replace function public.can_run_scan_type(requested_type text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin()
    or (
      select requested_type = any(pl.allowed_scan_types)
      from public.plan_limits pl
      where pl.plan = public.user_plan()
    );
$$;

-- ============================================================
-- 6. Guard: can the current user enable continuous monitoring?
-- ============================================================
create or replace function public.can_use_monitoring()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin()
    or (
      select pl.can_monitor
      from public.plan_limits pl
      where pl.plan = public.user_plan()
    );
$$;

-- ============================================================
-- 7. Guard: can the current user create a badge?
-- ============================================================
create or replace function public.can_use_badge()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin()
    or (
      select pl.can_badge
      from public.plan_limits pl
      where pl.plan = public.user_plan()
    );
$$;

-- ============================================================
-- 8. Guard: can the current user add integrations?
-- ============================================================
create or replace function public.can_use_integrations()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin()
    or (
      select pl.can_integrations
      from public.plan_limits pl
      where pl.plan = public.user_plan()
    );
$$;

-- ============================================================
-- 9. RLS: enforce URL limit on insert
-- ============================================================
create policy "enforce url plan limit on insert"
  on public.urls for insert
  with check (
    auth.uid() = user_id
    and public.can_add_url()
  );

-- ============================================================
-- 10. RLS: enforce scan type on insert
-- ============================================================
create policy "enforce scan type on insert"
  on public.scans for insert
  with check (
    auth.uid() = user_id
    and public.can_run_scan_type(scan_type)
  );

-- ============================================================
-- 11. RLS: enforce monitoring mode on URL insert/update
-- ============================================================
create policy "enforce monitoring mode on url insert"
  on public.urls for insert
  with check (
    auth.uid() = user_id
    and (monitoring_mode = 'one_off' or public.can_use_monitoring())
  );

create policy "enforce monitoring mode on url update"
  on public.urls for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (monitoring_mode = 'one_off' or public.can_use_monitoring())
  );

-- ============================================================
-- 12. RLS: enforce badge creation on plan
-- ============================================================
create policy "enforce badge plan limit on insert"
  on public.badges for insert
  with check (public.can_use_badge());

-- ============================================================
-- 13. RLS: enforce integrations on plan
-- ============================================================
create policy "enforce integrations plan limit on insert"
  on public.integrations for insert
  with check (
    auth.uid() = user_id
    and public.can_use_integrations()
  );

-- ============================================================
-- 14. Convenience view: current user's entitlements
--     Read this in the app to show/hide features without extra queries.
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
  public.can_use_integrations()                 as can_integrations;
