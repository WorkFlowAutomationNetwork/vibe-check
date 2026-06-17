-- ============================================================
-- Security review fixes A1 + A2 (2026-06-17)
--
-- A1: The `anon can view public scan findings` policy granted the
--     public anon role SELECT on ALL columns of `findings` for any
--     public scan — including description / what_we_did / remediation
--     / metadata, which the public report page promises are
--     "only visible to the account owner". Application-layer column
--     selection is not a confidentiality boundary against a key that
--     ships in the browser bundle. We enforce it in the database
--     instead: a curated `public_findings` view exposing only the
--     safe columns, and we remove anon's access to the base table.
--
-- A2: The `anon can view active badges` policy let anon enumerate the
--     entire active-badge table (every customer's public_token,
--     url_id -> scan_id mapping, expiry) defeating the secret-token
--     design. The badge endpoint already uses the service-role client,
--     so anon needs no direct access to `badges` at all.
-- ============================================================

-- ------------------------------------------------------------
-- A1: public_findings view
-- ------------------------------------------------------------
-- security_invoker is left at the default (false) so the view runs
-- with the owner's privileges and bypasses the base-table RLS. This
-- is deliberate: the view itself is the access boundary — it only
-- selects safe columns and only for scans the owner has published
-- (is_public = true). anon never touches the base `findings` table.
create or replace view public.public_findings as
select
  f.id,
  f.scan_id,
  f.severity,
  f.title,
  f.category,
  f.result
from public.findings f
join public.scans s on s.id = f.scan_id
where s.is_public = true;

comment on view public.public_findings is
  'Public projection of findings for is_public scans. Exposes only '
  'non-sensitive columns (no description/what_we_did/remediation/metadata). '
  'This view is the confidentiality boundary for shareable reports — '
  'the anon role has no SELECT on the findings base table.';

-- Remove the over-broad anon policy on the base table. With no anon
-- SELECT policy, RLS denies anon all access to `findings` directly;
-- owners still read their own rows via "users can view own findings".
drop policy if exists "anon can view public scan findings" on public.findings;

-- Grant read access to the curated view only. Supabase's default
-- privileges grant ALL on new public objects to anon/authenticated, so
-- revoke first and re-grant just SELECT (least privilege — the view is a
-- read-only public projection).
revoke all on public.public_findings from anon, authenticated;
grant select on public.public_findings to anon, authenticated;

-- ------------------------------------------------------------
-- A2: drop table-wide anon access to badges
-- ------------------------------------------------------------
-- The /api/badge/[token] route uses the service-role client, which
-- bypasses RLS, so it is unaffected. badge_status (security_invoker =
-- true) and the authenticated app pages rely on "users can view own
-- badges", also unaffected.
drop policy if exists "anon can view active badges" on public.badges;
