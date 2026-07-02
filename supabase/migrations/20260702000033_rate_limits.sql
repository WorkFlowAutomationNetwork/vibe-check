-- ============================================================
-- Rate limiting store (2026-07-02) — Security-feedback.md N8
--
-- APPLIED to prod 2026-07-02 via Supabase MCP and verified live (window
-- enforcement correct; anon RPC + table both 401; not anon-executable per advisors).
--
-- Postgres-backed fixed-window limiter. The web app has no Redis client and
-- runs on Vercel serverless (in-memory won't work across instances), so counters
-- live here and are read/written only by the service role from the Node API
-- routes (lib/rate-limit.ts). Chosen over Upstash to avoid adding a new external
-- sub-processor right after the privacy review.
-- ============================================================

create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int         not null default 0
);

comment on table public.rate_limits is
  'Fixed-window rate-limit counters. One row per limit key (e.g. '
  '"notify:ip:1.2.3.4", "verify:user:<uuid>"). Written only by the service '
  'role via public.check_rate_limit(). RLS on + no policy => no anon/authenticated access.';

-- Service-role-only. RLS enabled with no policy denies anon/authenticated
-- entirely; the service role (used by check_rate_limit / the API routes)
-- bypasses RLS. Mirrors the `waitlist` table's posture.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Atomic check-and-increment. Returns whether the caller is allowed, how many
-- requests remain in the window, and when the window resets. A single upsert
-- (row-locked on conflict) so concurrent requests count correctly.
create or replace function public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now          timestamptz := now();
  v_count        int;
  v_window_start timestamptz;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
          when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
          else rl.window_start
        end
  returning rl.count, rl.window_start into v_count, v_window_start;

  return query select
    (v_count <= p_max)                                            as allowed,
    greatest(p_max - v_count, 0)                                  as remaining,
    (v_window_start + make_interval(secs => p_window_seconds))    as reset_at;
end;
$$;

-- Lock the function down: only the service role should call it (advisor
-- 0028/0029 lesson from the 2026-07-02 audit — don't leave SECURITY DEFINER
-- functions anon/authenticated-executable via /rest/v1/rpc/*).
revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
