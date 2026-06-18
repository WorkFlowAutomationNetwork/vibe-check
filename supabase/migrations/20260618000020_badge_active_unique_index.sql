-- Enforce the one-active-badge-per-URL invariant at the database level.
-- Previously this was enforced only in application code (lib/badges.py::issue_badge,
-- which lapses the prior active badge before inserting a new one). A partial unique
-- index closes the supersede race: many lapsed/revoked rows per URL are still allowed,
-- but at most one active badge can exist per URL at any time.
create unique index if not exists badges_one_active_per_url
  on public.badges (url_id)
  where status = 'active';
