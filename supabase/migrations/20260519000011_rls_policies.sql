-- ============================================================
-- profiles
-- ============================================================
create policy "users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================
-- urls
-- ============================================================
create policy "users can view own urls"
  on public.urls for select
  using (auth.uid() = user_id);

create policy "users can insert own urls"
  on public.urls for insert
  with check (auth.uid() = user_id);

create policy "users can update own urls"
  on public.urls for update
  using (auth.uid() = user_id);

-- ============================================================
-- scans
-- Users see their own. Anon sees public scans (share links, badge lookups).
-- Multiple permissive SELECT policies combine with OR.
-- ============================================================
create policy "users can view own scans"
  on public.scans for select
  using (auth.uid() = user_id);

create policy "anon can view public scans"
  on public.scans for select
  using (is_public = true);

-- ============================================================
-- findings
-- Column-level restriction (hide description/remediation from anon) is
-- enforced at the API layer, not here.
-- ============================================================
create policy "users can view own findings"
  on public.findings for select
  using (
    exists (
      select 1 from public.scans s
      where s.id = findings.scan_id
        and s.user_id = auth.uid()
    )
  );

create policy "anon can view public scan findings"
  on public.findings for select
  using (
    exists (
      select 1 from public.scans s
      where s.id = findings.scan_id
        and s.is_public = true
    )
  );

-- ============================================================
-- badges
-- Anon can read active badges by public_token (badge embed endpoint).
-- ============================================================
create policy "users can view own badges"
  on public.badges for select
  using (
    exists (
      select 1 from public.urls u
      where u.id = badges.url_id
        and u.user_id = auth.uid()
    )
  );

create policy "anon can view active badges"
  on public.badges for select
  using (status = 'active');

-- ============================================================
-- activity_log — read-only for users; inserts via service role only
-- ============================================================
create policy "users can view own activity"
  on public.activity_log for select
  using (auth.uid() = user_id);

-- ============================================================
-- integrations
-- ============================================================
create policy "users can view own integrations"
  on public.integrations for select
  using (auth.uid() = user_id);

create policy "users can update own integrations"
  on public.integrations for update
  using (auth.uid() = user_id);

-- ============================================================
-- webhook_log — read-only for users; inserts via service role only
-- ============================================================
create policy "users can view own webhook logs"
  on public.webhook_log for select
  using (
    exists (
      select 1 from public.integrations i
      where i.id = webhook_log.integration_id
        and i.user_id = auth.uid()
    )
  );

-- ============================================================
-- api_keys
-- ============================================================
create policy "users can view own api keys"
  on public.api_keys for select
  using (auth.uid() = user_id);

create policy "users can insert own api keys"
  on public.api_keys for insert
  with check (auth.uid() = user_id);

create policy "users can update own api keys"
  on public.api_keys for update
  using (auth.uid() = user_id);
