-- Local development seed. Applied by: npx supabase db reset
-- Requires a user created via Supabase Studio (http://localhost:54323)
-- before running, or: npx supabase auth create-user

do $$
declare
  v_user_id         uuid;
  v_url_id          uuid;
  v_scan_id         uuid;
  v_integration_id  uuid;
begin
  select id into v_user_id from auth.users order by created_at limit 1;

  if v_user_id is null then
    raise notice 'SEED SKIPPED: No users found. Create one at http://localhost:54323 first.';
    return;
  end if;

  update public.profiles set plan = 'monitor', name = 'Dev User' where id = v_user_id;

  insert into public.urls (user_id, url, verified, verification_token, verification_method, verified_at, label, monitoring_mode)
  values (v_user_id, 'acme-app.vercel.app', true, 'vc-verify-dev-seed-001', 'dns', now() - interval '30 days', 'production', 'continuous')
  on conflict do nothing
  returning id into v_url_id;

  if v_url_id is null then
    select id into v_url_id from public.urls where user_id = v_user_id and url = 'acme-app.vercel.app';
  end if;

  insert into public.scans (url_id, user_id, scan_type, status, grade, score, triggered_by, rate_limit_mode, checks_total, started_at, completed_at, duration_ms, scanner_version, is_public)
  values (v_url_id, v_user_id, 'active', 'completed', 'B+', 78.50, 'manual', 'polite', 180,
          now() - interval '3 days', now() - interval '3 days' + interval '58 seconds', 58400, '1.0.0', true)
  returning id into v_scan_id;

  insert into public.findings (scan_id, check_name, category, severity, result, title, method, duration_ms, description, what_we_did, remediation, first_seen_at)
  values
  (v_scan_id, 'ai.prompt_injection', 'ai', 'critical', 'fail',
   'Prompt injection bypass /api/chat', 'POST /api/chat · 40 payloads', 1821,
   'Your AI endpoint accepts user input that can override the system prompt.',
   'Sent 40 adversarial payloads against POST /api/chat. 6 of 40 succeeded.',
   'Move untrusted input into a separate message with structured delimiters.',
   now() - interval '3 days'),
  (v_scan_id, 'headers.csp', 'headers', 'medium', 'fail',
   'Missing Content-Security-Policy header', 'GET /, /login → policy parse', 412,
   'No CSP is set, so any injected script tag on your domain runs with full privileges.',
   'Read response headers for GET / and three sub-routes. Found HSTS ✓, but CSP ✗.',
   'Add a strict CSP to next.config.js with ''self'' defaults.',
   now() - interval '3 days'),
  (v_scan_id, 'tls.hsts', 'transport', 'pass', 'pass',
   'TLS / HSTS — transport layer secure', 'HEAD / → header inspect', 241,
   'TLS 1.3 negotiated, HSTS set with max-age=31536000; includeSubDomains; preload.',
   null, null, now() - interval '30 days');

  insert into public.badges (url_id, scan_id, status, public_token, expires_at)
  values (v_url_id, v_scan_id, 'active', 'dev-public-badge-token-001', now() + interval '27 days');

  insert into public.activity_log (user_id, url_id, scan_id, event_type, payload)
  values
  (v_user_id, v_url_id, v_scan_id, 'scan_completed',
   jsonb_build_object('grade', 'B+', 'prev_grade', 'B', 'checks_total', 180, 'issues_resolved', 2)),
  (v_user_id, v_url_id, v_scan_id, 'badge_renewed',
   jsonb_build_object('expires_at', (now() + interval '27 days')::text, 'public_token', 'dev-public-badge-token-001'));

  insert into public.integrations (user_id, type, status, config, last_triggered_at)
  values (v_user_id, 'vercel', 'active',
    '{"webhook_secret": "dev-secret-001", "projects": [{"name": "acme-app", "webhook_url": "http://localhost:8000/hooks/deploy/dev"}]}'::jsonb,
    now() - interval '3 days')
  returning id into v_integration_id;

  insert into public.webhook_log (integration_id, source, payload, scan_id, action, status, response_code)
  values (v_integration_id, 'Vercel',
    '{"type": "deployment.succeeded", "project": "acme-app", "branch": "main"}'::jsonb,
    v_scan_id, 'prod deploy · scan complete', 'SCAN_DONE', 200);

  insert into public.api_keys (user_id, key_hash, key_prefix, name)
  values (v_user_id,
    crypt('vc_live_sk_devtestkey_local', gen_salt('bf')),
    'vc_live_sk_devt', 'Local dev test key');

  raise notice 'SEED COMPLETE: data created for user %', v_user_id;
end;
$$;
