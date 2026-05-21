-- ============================================================
-- Admin role support
-- ============================================================

-- Add is_admin column to profiles
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Security-definer helper avoids infinite recursion when checking
-- is_admin from within an RLS policy on the profiles table itself.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- Admin RLS policies — admins can read/write all rows
-- ============================================================

-- profiles: admin full access
create policy "admin can view all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "admin can update all profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- urls: admin read all
create policy "admin can view all urls"
  on public.urls for select
  using (public.is_admin());

create policy "admin can update all urls"
  on public.urls for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin can delete urls"
  on public.urls for delete
  using (public.is_admin());

-- scans: admin read all
create policy "admin can view all scans"
  on public.scans for select
  using (public.is_admin());

create policy "admin can update all scans"
  on public.scans for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- findings: admin read all
create policy "admin can view all findings"
  on public.findings for select
  using (public.is_admin());

-- badges: admin read all
create policy "admin can view all badges"
  on public.badges for select
  using (public.is_admin());

-- activity_log: admin read all
create policy "admin can view all activity"
  on public.activity_log for select
  using (public.is_admin());

-- integrations: admin read all
create policy "admin can view all integrations"
  on public.integrations for select
  using (public.is_admin());

-- ============================================================
-- Aggregate stats view for admin dashboard (service role only)
-- ============================================================
create or replace view public.admin_stats as
select
  (select count(*) from public.profiles)                                           as total_users,
  (select count(*) from public.profiles where plan = 'free')                       as free_users,
  (select count(*) from public.profiles where plan = 'starter')                    as starter_users,
  (select count(*) from public.profiles where plan = 'monitor')                    as monitor_users,
  (select count(*) from public.scans)                                              as total_scans,
  (select count(*) from public.scans where status = 'completed')                   as completed_scans,
  (select count(*) from public.scans where status = 'failed')                      as failed_scans,
  (select count(*) from public.scans where status in ('pending', 'running'))       as active_scans,
  (select count(*) from public.findings)                                           as total_findings,
  (select count(*) from public.findings where severity = 'critical')               as critical_findings,
  (select count(*) from public.urls)                                               as total_urls,
  (select count(*) from public.urls where verified = true)                         as verified_urls;
