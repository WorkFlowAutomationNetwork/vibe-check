-- ============================================================
-- Security review C3 (2026-06-17, implemented 2026-06-30)
--
-- The Privacy Policy states activity & webhook logs are "retained for
-- 30 days, then purged." That TTL was written but never enforced — no
-- scheduled job existed. This migration implements it with pg_cron so
-- the stated retention is actually true.
--
-- Scope: activity_log + webhook_log only. Scan findings/PDFs are kept
-- for the lifetime of the account (per the policy) and purged on account
-- deletion via FK cascade + a Storage cleanup, not on a TTL.
-- ============================================================

create extension if not exists pg_cron;

-- Hard-delete log rows older than 30 days. SECURITY DEFINER so the cron
-- job (runs as the function owner) can delete regardless of RLS; search_path
-- pinned to public to avoid hijacking.
create or replace function public.purge_expired_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.activity_log where created_at < now() - interval '30 days';
  delete from public.webhook_log  where created_at < now() - interval '30 days';
end;
$$;

comment on function public.purge_expired_logs is
  'Enforces the 30-day retention promised in the Privacy Policy for '
  'activity_log + webhook_log. Scheduled daily via pg_cron (purge-expired-logs).';

-- This is a maintenance function, not an API. Postgres grants EXECUTE on new
-- functions to PUBLIC by default, which would let anon/authenticated trigger
-- the purge on demand via /rest/v1/rpc. Lock it down to the job owner only.
revoke all on function public.purge_expired_logs() from public, anon, authenticated;

-- Re-running this migration replaces the job of the same name rather than
-- stacking duplicates (cron.schedule upserts by jobname). Runs daily 03:17 UTC.
select cron.schedule('purge-expired-logs', '17 3 * * *', $$select public.purge_expired_logs()$$);
