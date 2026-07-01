-- ============================================================
-- Badge public-report toggle (2026-07-01)
--
-- The public report page (/report/[scanId]/public, linked from every issued
-- badge) previously gated on scans.is_public, but nothing in the app or
-- scanner ever set that column true -- the page has never actually been
-- reachable with real data. Replace it with a real, owner-controlled,
-- per-URL toggle that defaults OFF: a badge only links through to detail
-- if the URL owner explicitly opts in. `is_public` and its existing RLS
-- policies are untouched -- they also back the unrelated authenticated
-- "view a report someone shared with me" fallback on /report/[scanId],
-- which this migration does not touch.
--
-- While rebuilding this pathway, also narrow what "public" actually means:
-- the old public_findings view (migration 18) exposed per-finding title +
-- category to the anon key -- a scan-detail inventory handed to anyone who
-- clicks a badge, whether or not the app UI chose to render it. Same class
-- of bug as A1/A7 (application-layer restriction is not a confidentiality
-- boundary against a key that ships in the browser). Replace it with
-- public_finding_counts: severity + count only, no title/category/result.
-- It has exactly one consumer (the public report page) so the old view is
-- dropped outright rather than left as an unused, still-live exposure.
-- ============================================================

alter table public.urls
  add column public_report_enabled boolean not null default false;

comment on column public.urls.public_report_enabled is
  'Owner opt-in: does this URL''s badge link through to the public report '
  'page, or just to the marketing homepage? Defaults off -- pasting a badge '
  'does not by itself expose scan detail.';

-- ------------------------------------------------------------
-- public_urls: gate on the new toggle instead of the is_public-via-scans
-- exists() check. Same exposed columns (id, url) as migration 28.
-- ------------------------------------------------------------
create or replace view public.public_urls as
select
  u.id,
  u.url
from public.urls u
where u.deleted_at is null
  and u.public_report_enabled = true;

comment on view public.public_urls is
  'Public projection of urls with public_report_enabled = true. Exposes '
  'only id + url (never user_id / verification_token / verification_method). '
  'This view is the confidentiality boundary for the public report page -- '
  'the anon role has no SELECT on the urls base table.';

-- ------------------------------------------------------------
-- public_scans: new curated view so the public report page stops reading
-- the scans base table directly (which anon can already SELECT in full
-- via the pre-existing "anon can view public scans" policy -- unchanged
-- here, still backing the separate /report/[scanId] fallback).
-- ------------------------------------------------------------
create or replace view public.public_scans as
select
  s.id,
  s.grade,
  s.score,
  s.completed_at,
  s.scan_type,
  s.url_id,
  s.checks_total
from public.scans s
join public.urls u on u.id = s.url_id
where u.public_report_enabled = true;

comment on view public.public_scans is
  'Public projection of scans for urls with public_report_enabled = true. '
  'Exposes only display columns -- no user_id/triggered_by/scanner_version/ '
  'rate_limit_mode/duration_ms. Confidentiality boundary for the public '
  'report page.';

revoke all on public.public_scans from anon, authenticated;
grant select on public.public_scans to anon, authenticated;

-- ------------------------------------------------------------
-- public_finding_counts replaces public_findings: severity + count only,
-- never title/category/result. The public report page shows a grade and
-- a severity breakdown, not an itemised finding list.
-- ------------------------------------------------------------
drop view if exists public.public_findings;

create view public.public_finding_counts as
select
  s.id as scan_id,
  f.severity,
  count(*)::int as count
from public.findings f
join public.scans s on s.id = f.scan_id
join public.urls u on u.id = s.url_id
where u.public_report_enabled = true
group by s.id, f.severity;

comment on view public.public_finding_counts is
  'Severity counts only for urls with public_report_enabled = true -- no '
  'title/category/result/description/remediation. Deliberately too coarse '
  'to hand an anonymous visitor a vulnerability inventory for a live site.';

revoke all on public.public_finding_counts from anon, authenticated;
grant select on public.public_finding_counts to anon, authenticated;
