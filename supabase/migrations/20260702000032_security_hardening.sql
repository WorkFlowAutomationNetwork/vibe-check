-- ============================================================
-- Security hardening (2026-07-02 pre-launch consolidated review)
--
-- APPLIED to prod 2026-07-02 via Supabase MCP and verified live (anon
-- GET /rest/v1/admin_stats now 401s; service-role read intact; advisors cleared).
-- Findings come from the 2026-07-02 review documented in Security-feedback.md
-- (§ "2026-07-02 re-audit"), verified live against project lvkiflbpbtmlrgdftivt
-- including a real anon-key PostgREST probe.
-- ============================================================

-- 1. admin_stats leaked business metrics to the anon key.
--    CONFIRMED via anon-key probe: GET /rest/v1/admin_stats returned
--    total_users, the plan breakdown (free/starter/monitor_users), scan
--    counts, finding counts (incl. critical) and verified-URL counts to the
--    public internet. admin_stats is a SECURITY DEFINER view (bypasses
--    base-table RLS) carrying Supabase's default broad anon/authenticated
--    SELECT grant. Its only legitimate reader is the admin dashboard via the
--    service-role client (apps/web/app/admin/dashboard/page.tsx), which is
--    unaffected by these grants. Lock it to service-role only, and flip to
--    security_invoker for defense in depth (+ clears advisor 0010 for it).
alter view public.admin_stats set (security_invoker = true);
revoke all on public.admin_stats from anon, authenticated;

-- 2. public_scans / public_finding_counts did not filter soft-deleted URLs,
--    unlike public_urls. A URL that was shared (public_report_enabled = true)
--    then soft-deleted still exposed its scan grades + severity counts +
--    url_id to anon. Add the deleted_at filter to match public_urls. These
--    views stay SECURITY DEFINER by design -- they ARE the confidentiality
--    boundary (anon has no base-table access), so invoker mode would break
--    them; advisor 0010 on these three is expected/accepted.
create or replace view public.public_scans as
select s.id, s.grade, s.score, s.completed_at, s.scan_type, s.url_id, s.checks_total
from public.scans s
join public.urls u on u.id = s.url_id
where u.public_report_enabled = true
  and u.deleted_at is null;

create or replace view public.public_finding_counts as
select s.id as scan_id, f.severity, count(*)::int as count
from public.findings f
join public.scans s on s.id = f.scan_id
join public.urls u on u.id = s.url_id
where u.public_report_enabled = true
  and u.deleted_at is null
group by s.id, f.severity;

-- 3. Mutable search_path on SECURITY DEFINER / trigger functions (advisor
--    0011). Pin to public. The auth.users references inside are already
--    schema-qualified, so this does not change name resolution. (The
--    entitlement helpers user_plan/can_run_scan/etc. already SET search_path.)
alter function public.auto_admin_on_signup() set search_path = public;
alter function public.protect_profile_sensitive_fields() set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- 4. Trigger functions were needlessly RPC-callable by anon/authenticated
--    (advisor 0028/0029, /rest/v1/rpc/*). Postgres does NOT require EXECUTE
--    privilege to fire a trigger, so revoking it leaves the triggers working
--    and only removes the RPC attack surface.
revoke execute on function public.auto_admin_on_signup() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_sensitive_fields() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
