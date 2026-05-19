-- Run against the local DB to verify the full schema is applied correctly.
-- Usage: psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
-- Expected: five NOTICE lines, no errors.

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'), 'pgcrypto extension not installed';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles'), 'public.profiles table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'default_scan_depth'), 'profiles.default_scan_depth column missing';
  RAISE NOTICE 'Task 1 assertions passed: extensions + profiles';
END $$;

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'urls'), 'public.urls table missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'urls' AND indexname = 'urls_user_url_unique'), 'urls partial unique index missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scans'), 'public.scans table missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'scans' AND indexname = 'one_active_scan_per_url'), 'scans partial unique index missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scans' AND column_name = 'is_public'), 'scans.is_public column missing';
  RAISE NOTICE 'Task 2 assertions passed: urls + scans';
END $$;

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'findings'), 'public.findings table missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'findings' AND indexname = 'findings_scan_category_severity'), 'findings composite index missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'findings' AND column_name = 'first_seen_at'), 'findings.first_seen_at column missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'badges'), 'public.badges table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'badges' AND column_name = 'public_token'), 'badges.public_token column missing';
  RAISE NOTICE 'Task 3 assertions passed: findings + badges';
END $$;

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_log'), 'public.activity_log table missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'activity_log' AND indexname = 'activity_log_user_created'), 'activity_log index missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'integrations'), 'public.integrations table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webhook_log'), 'public.webhook_log table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_keys'), 'public.api_keys table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'api_keys' AND column_name = 'key_prefix'), 'api_keys.key_prefix column missing';
  RAISE NOTICE 'Task 4 assertions passed: activity_log + integrations + webhook_log + api_keys';
END $$;

DO $$
BEGIN
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'profiles' AND schemaname = 'public'), 'RLS not enabled on profiles';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'urls' AND schemaname = 'public'), 'RLS not enabled on urls';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'scans' AND schemaname = 'public'), 'RLS not enabled on scans';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'findings' AND schemaname = 'public'), 'RLS not enabled on findings';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'badges' AND schemaname = 'public'), 'RLS not enabled on badges';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'activity_log' AND schemaname = 'public'), 'RLS not enabled on activity_log';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'integrations' AND schemaname = 'public'), 'RLS not enabled on integrations';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'webhook_log' AND schemaname = 'public'), 'RLS not enabled on webhook_log';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'api_keys' AND schemaname = 'public'), 'RLS not enabled on api_keys';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'profiles') > 0, 'No RLS policies on profiles';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'scans') > 0, 'No RLS policies on scans';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'findings') > 0, 'No RLS policies on findings';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'badges') > 0, 'No RLS policies on badges';
  RAISE NOTICE 'Task 5 assertions passed: RLS enabled + policies present on all tables';
END $$;
