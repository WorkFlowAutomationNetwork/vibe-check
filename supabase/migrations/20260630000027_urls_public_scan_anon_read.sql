-- Allow anon to read the URL string for URLs that have at least one publicly
-- shared scan. Without this, the public report page (/report/[id]/public)
-- renders the URL as blank for non-logged-in visitors because the existing
-- "users can view own urls" policy requires auth.uid() = user_id.
--
-- This is safe: the URL hostname is already displayed on the public report;
-- we're just allowing the DB query to return it consistently rather than
-- relying on application-layer fallback handling.
create policy "anon can view urls for public scans"
  on public.urls for select
  using (
    exists (
      select 1
      from public.scans s
      where s.url_id = urls.id
        and s.is_public = true
    )
  );
