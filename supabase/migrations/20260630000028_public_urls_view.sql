-- ============================================================
-- Security re-audit finding A7 (2026-06-30)
--
-- Migration 20260630000027 added the policy
--   "anon can view urls for public scans"
-- to fix public reports rendering a blank URL for logged-out
-- visitors. The intent was correct but the mechanism was too broad:
-- a table-wide anon SELECT policy with NO column restriction grants
-- the public anon key SELECT on EVERY column of `urls` for any row
-- with a public scan — including user_id (customer enumeration),
-- verification_token (the ownership-proof secret), verification_method,
-- monitoring_mode, verified_at, and label.
--
-- This re-introduces the exact A1/A2 class: application-layer column
-- selection (the public page selects only `url`) is not a
-- confidentiality boundary against a key that ships in the browser
-- bundle. We enforce it in the database instead — a curated
-- `public_urls` view exposing only id + url, for non-deleted public
-- scans, and we remove anon's access to the base table.
-- ============================================================

-- security_invoker left at the default (false) so the view runs with
-- the owner's privileges and bypasses base-table RLS. The view itself
-- is the access boundary: it exposes only id + url, and only for URLs
-- that have a public, non-deleted scan. anon never touches the base
-- `urls` table.
create or replace view public.public_urls as
select
  u.id,
  u.url
from public.urls u
where u.deleted_at is null
  and exists (
    select 1
    from public.scans s
    where s.url_id = u.id
      and s.is_public = true
  );

comment on view public.public_urls is
  'Public projection of urls for is_public scans. Exposes only id + url '
  '(never user_id / verification_token / verification_method). This view '
  'is the confidentiality boundary for the public report page — the anon '
  'role has no SELECT on the urls base table.';

-- Remove the over-broad anon policy added in 27. With no anon SELECT
-- policy, RLS denies anon all direct access to `urls`; owners still read
-- their own rows via "users can view own urls".
drop policy if exists "anon can view urls for public scans" on public.urls;

-- Grant read access to the curated view only. Supabase's default
-- privileges grant ALL on new public objects to anon/authenticated, so
-- revoke first and re-grant just SELECT (least privilege).
revoke all on public.public_urls from anon, authenticated;
grant select on public.public_urls to anon, authenticated;
