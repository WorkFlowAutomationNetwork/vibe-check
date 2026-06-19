-- Allow a user to hard-delete one of their own URLs, but only while it has no
-- scans. Once a scan exists the URL has history (findings, possibly a badge) and
-- must not be silently removed. The no-scans rule is enforced here in the policy
-- USING clause so it holds even if the app-layer check is bypassed.
create policy "users can delete own urls without scans"
  on public.urls for delete
  using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.scans where scans.url_id = urls.id
    )
  );
