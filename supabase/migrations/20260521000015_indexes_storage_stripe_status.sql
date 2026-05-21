-- ============================================================
-- Migration 015: FK indexes, stripe_subscription_status,
--                Storage bucket for PDFs, badge_status view
-- ============================================================

-- ============================================================
-- 1. stripe_subscription_status on profiles
--    Mirrors Stripe's subscription status field so the billing
--    page can distinguish active, past_due, canceled, trialing
--    without hitting the Stripe API on every page load.
-- ============================================================
alter table public.profiles
  add column if not exists stripe_subscription_status text
    check (stripe_subscription_status in (
      'active', 'trialing', 'past_due',
      'canceled', 'incomplete', 'incomplete_expired',
      'unpaid', 'paused'
    ));

-- ============================================================
-- 2. Missing FK indexes
--    Postgres does not auto-index foreign keys. These columns
--    are in WHERE clauses on high-traffic queries.
-- ============================================================

-- scans by user (dashboard, report list)
create index if not exists scans_user_id_idx
  on public.scans (user_id);

-- scans by url (report listing, one-active check)
create index if not exists scans_url_id_idx
  on public.scans (url_id);

-- scans by status (admin panel, queue dedup check)
create index if not exists scans_status_idx
  on public.scans (status);

-- badges by url (badge lookup when a scan completes)
create index if not exists badges_url_id_idx
  on public.badges (url_id);

-- badges by scan (join from scan → badge)
create index if not exists badges_scan_id_idx
  on public.badges (scan_id);

-- api_keys by user (settings page)
create index if not exists api_keys_user_id_idx
  on public.api_keys (user_id);

-- integrations by user (integrations page)
create index if not exists integrations_user_id_idx
  on public.integrations (user_id);

-- webhook_log by integration (integration detail view)
create index if not exists webhook_log_integration_id_idx
  on public.webhook_log (integration_id);

-- urls by user (already has a unique partial index; add general one for soft-deleted queries)
create index if not exists urls_user_id_idx
  on public.urls (user_id);

-- ============================================================
-- 3. Supabase Storage — reports bucket
--    PDFs are stored at: reports/{user_id}/{scan_id}.pdf
--    Private bucket. Users can only access their own folder.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports',
  'reports',
  false,
  52428800, -- 50 MB max per PDF
  array['application/pdf']
)
on conflict (id) do nothing;

-- Users can upload their own scan PDFs (scanner writes via service role,
-- but this policy also allows the web app to upload if needed)
create policy "users can upload own reports"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own PDFs (for the Download PDF button)
create policy "users can read own reports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can do everything (scanner uploads, admin reads)
-- No policy needed — service role bypasses RLS.

-- ============================================================
-- 4. badge_status view
--    Overlays effective_status so callers don't need to check
--    expires_at manually. Respects RLS via security_invoker.
-- ============================================================
create or replace view public.badge_status
  with (security_invoker = true)
as
select
  b.*,
  case
    when b.status = 'revoked'                          then 'revoked'
    when b.status = 'active' and b.expires_at < now() then 'lapsed'
    else b.status
  end as effective_status
from public.badges b;

comment on view public.badge_status is
  'Badges with computed effective_status: auto-lapses when expires_at passes.';
