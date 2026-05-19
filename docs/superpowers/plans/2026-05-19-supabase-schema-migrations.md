# Supabase Schema Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all Supabase migration files for the 9-table Vibe-Check schema, apply them locally, verify with SQL assertions, and produce a working seed dataset for local development.

**Architecture:** One migration file per table, applied in FK-dependency order via `npx supabase db reset`. RLS policies are collected into a single final migration so all tables exist before policies reference them. Verification uses `DO $$` assertion blocks executed against the local Postgres instance.

**Tech Stack:** Supabase CLI, PostgreSQL 15, `plpgsql`, pgcrypto extension (for seed bcrypt), Docker (required for local Supabase).

---

## File map

```
supabase/
  config.toml                          ← created by supabase init
  seed.sql                             ← Task 6
  migrations/
    20260519000001_extensions.sql      ← Task 1
    20260519000002_profiles.sql        ← Task 1
    20260519000003_urls.sql            ← Task 2
    20260519000004_scans.sql           ← Task 2
    20260519000005_findings.sql        ← Task 3
    20260519000006_badges.sql          ← Task 3
    20260519000007_activity_log.sql    ← Task 4
    20260519000008_integrations.sql    ← Task 4
    20260519000009_webhook_log.sql     ← Task 4
    20260519000010_api_keys.sql        ← Task 4
    20260519000011_rls_policies.sql    ← Task 5
  tests/
    verify_schema.sql                  ← grows across tasks, final form in Task 5
```

---

## Task 0: Initialize Supabase project and local dev environment

**Files:**
- Create: `supabase/config.toml` (via CLI)
- Create: `.env.local` (local credentials, gitignored)
- Modify: `.gitignore`

- [ ] **Step 1: Install Supabase CLI**

```bash
npm install supabase --save-dev
```

Expected output: `added 1 package` (or similar). Verify:

```bash
npx supabase --version
```

Expected: `1.x.x` or higher.

- [ ] **Step 2: Initialize Supabase project**

Run from the repo root (`C:\Users\paddy\PC_CODING\Vibe-Check`):

```bash
npx supabase init
```

Expected output:
```
Finished supabase init.
```

This creates `supabase/config.toml`. Do not edit it yet.

- [ ] **Step 3: Ensure Docker is running, then start local Supabase**

```bash
npx supabase start
```

Expected output (takes ~60s on first run while pulling images):
```
Started supabase local development setup.

         API URL: http://localhost:54321
     GraphQL URL: http://localhost:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Copy the `anon key` and `service_role key` — you will need them.

- [ ] **Step 4: Create `.env.local` with local credentials**

Create `apps/web/.env.local` (this file must NOT be committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key from step 3>
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key from step 3>
```

- [ ] **Step 5: Add `.env.local` to `.gitignore`**

Create `.gitignore` at repo root if it doesn't exist:

```
.env.local
.env*.local
node_modules/
.next/
__pycache__/
*.pyc
.venv/
```

- [ ] **Step 6: Verify DB connection**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT version();"
```

Expected: prints PostgreSQL version string. If `psql` is not installed, use:

```bash
npx supabase db diff
```

Expected: `No schema changes found` (clean slate).

- [ ] **Step 7: Create the tests directory**

```bash
mkdir -p supabase/tests
```

- [ ] **Step 8: Commit**

```bash
git add supabase/ .gitignore apps/web/.env.local
git commit -m "chore: initialize supabase project and local dev environment"
```

Note: `.env.local` should be in `.gitignore` — confirm git does NOT stage it. If it does, run `git rm --cached apps/web/.env.local` first.

---

## Task 1: Extensions and profiles table

**Files:**
- Create: `supabase/migrations/20260519000001_extensions.sql`
- Create: `supabase/migrations/20260519000002_profiles.sql`
- Create: `supabase/tests/verify_schema.sql`

- [ ] **Step 1: Write the verification test (will fail before migration)**

Create `supabase/tests/verify_schema.sql`:

```sql
-- Run this file against the local DB to verify schema state.
-- Expected: passes after all migrations are applied.

DO $$
BEGIN
  -- Extensions
  ASSERT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ), 'pgcrypto extension not installed';

  -- Profiles table
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ), 'public.profiles table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'plan' AND column_default LIKE '%free%'
  ), 'profiles.plan column or default missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'default_scan_depth'
  ), 'profiles.default_scan_depth column missing';

  RAISE NOTICE 'Task 1 assertions passed: extensions + profiles';
END $$;
```

- [ ] **Step 2: Run the test — confirm it fails**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: `ERROR:  pgcrypto extension not installed` (or similar assertion failure). This is correct — the table doesn't exist yet.

- [ ] **Step 3: Create the extensions migration**

Create `supabase/migrations/20260519000001_extensions.sql`:

```sql
-- Enable required extensions.
-- pgcrypto: used in seed.sql for bcrypt hashing of test API keys.
-- uuid-ossp: available by default in Supabase but enabled explicitly for portability.
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
```

- [ ] **Step 4: Create the profiles migration**

Create `supabase/migrations/20260519000002_profiles.sql`:

```sql
-- Extends auth.users. One row per registered user, created automatically by trigger.
create table public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  plan                    text not null default 'free'
                            check (plan in ('free', 'starter', 'monitor')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  name                    text,
  notify_cve_matched      boolean not null default true,
  notify_scan_complete    boolean not null default false,
  notify_badge_expiry     boolean not null default true,
  notify_weekly_digest    boolean not null default false,
  default_scan_depth      text not null default 'active'
                            check (default_scan_depth in ('passive', 'active', 'deep')),
  default_rate_limit      text not null default 'polite'
                            check (default_rate_limit in ('polite', 'fast')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Shared trigger function for auto-updating updated_at.
-- Defined here; reused by integrations table in migration 008.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth.users row is inserted.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
```

- [ ] **Step 5: Apply migrations and run verification**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

Then run verification:

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected:
```
NOTICE:  Task 1 assertions passed: extensions + profiles
DO
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260519000001_extensions.sql \
        supabase/migrations/20260519000002_profiles.sql \
        supabase/tests/verify_schema.sql
git commit -m "feat: add extensions and profiles migration"
```

---

## Task 2: URLs and scans tables

**Files:**
- Create: `supabase/migrations/20260519000003_urls.sql`
- Create: `supabase/migrations/20260519000004_scans.sql`
- Modify: `supabase/tests/verify_schema.sql`

- [ ] **Step 1: Append assertions to verify_schema.sql**

Append to `supabase/tests/verify_schema.sql` (after the existing DO block, as a new DO block):

```sql
DO $$
BEGIN
  -- URLs table
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'urls'
  ), 'public.urls table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'urls'
      AND column_name = 'verification_token'
  ), 'urls.verification_token column missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'urls' AND indexname = 'urls_user_url_unique'
  ), 'urls partial unique index missing';

  -- Scans table
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scans'
  ), 'public.scans table missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'scans' AND indexname = 'one_active_scan_per_url'
  ), 'scans partial unique index missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scans'
      AND column_name = 'is_public'
  ), 'scans.is_public column missing';

  RAISE NOTICE 'Task 2 assertions passed: urls + scans';
END $$;
```

- [ ] **Step 2: Run verification — confirm it fails**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: `ERROR:  public.urls table missing`. Correct.

- [ ] **Step 3: Create the URLs migration**

Create `supabase/migrations/20260519000003_urls.sql`:

```sql
-- One row per URL a user has added for scanning.
-- Soft-deleted (deleted_at) to preserve scan history.
create table public.urls (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users on delete cascade,
  url                   text not null,
  verified              boolean not null default false,
  verification_token    text not null unique,
  verification_method   text check (verification_method in ('dns', 'file', 'meta')),
  verified_at           timestamptz,
  label                 text,
  monitoring_mode       text not null default 'one_off'
                          check (monitoring_mode in ('one_off', 'continuous')),
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Prevent the same user adding the same URL twice (ignores soft-deleted rows).
create unique index urls_user_url_unique
  on public.urls (user_id, url)
  where deleted_at is null;

alter table public.urls enable row level security;
```

- [ ] **Step 4: Create the scans migration**

Create `supabase/migrations/20260519000004_scans.sql`:

```sql
-- One row per scan run. Idempotent: scanning the same URL twice produces two rows.
create table public.scans (
  id                  uuid primary key default gen_random_uuid(),
  url_id              uuid not null references public.urls on delete cascade,
  user_id             uuid not null references auth.users on delete cascade,
  scan_type           text not null
                        check (scan_type in ('passive', 'active', 'deep')),
  status              text not null default 'pending'
                        check (status in ('pending', 'running', 'completed', 'failed')),
  grade               text
                        check (grade in ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F')),
  score               numeric(5,2),
  triggered_by        text not null default 'manual'
                        check (triggered_by in ('manual', 'webhook', 'api')),
  rate_limit_mode     text check (rate_limit_mode in ('polite', 'fast')),
  checks_total        int,
  started_at          timestamptz,
  completed_at        timestamptz,
  duration_ms         int,
  scanner_version     text,
  is_public           boolean not null default false,
  pdf_storage_path    text,
  created_at          timestamptz not null default now()
);

-- DB-enforced: only one pending/running scan per URL at a time.
create unique index one_active_scan_per_url
  on public.scans (url_id)
  where status in ('pending', 'running');

alter table public.scans enable row level security;
```

- [ ] **Step 5: Apply and verify**

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected output includes:
```
NOTICE:  Task 1 assertions passed: extensions + profiles
NOTICE:  Task 2 assertions passed: urls + scans
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260519000003_urls.sql \
        supabase/migrations/20260519000004_scans.sql \
        supabase/tests/verify_schema.sql
git commit -m "feat: add urls and scans migration"
```

---

## Task 3: Findings and badges tables

**Files:**
- Create: `supabase/migrations/20260519000005_findings.sql`
- Create: `supabase/migrations/20260519000006_badges.sql`
- Modify: `supabase/tests/verify_schema.sql`

- [ ] **Step 1: Append assertions to verify_schema.sql**

```sql
DO $$
BEGIN
  -- Findings table
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'findings'
  ), 'public.findings table missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'findings' AND indexname = 'findings_scan_category_severity'
  ), 'findings composite index missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'findings'
      AND column_name = 'first_seen_at'
  ), 'findings.first_seen_at column missing';

  -- Badges table
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'badges'
  ), 'public.badges table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'badges'
      AND column_name = 'public_token'
  ), 'badges.public_token column missing';

  RAISE NOTICE 'Task 3 assertions passed: findings + badges';
END $$;
```

- [ ] **Step 2: Run verification — confirm it fails**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: `ERROR:  public.findings table missing`.

- [ ] **Step 3: Create the findings migration**

Create `supabase/migrations/20260519000005_findings.sql`:

```sql
-- All check results from a scan — both the notable findings shown in report cards
-- and the full 180-check raw results shown in the checks table view.
-- description / what_we_did / remediation are nullable for low-detail pass checks.
create table public.findings (
  id              uuid primary key default gen_random_uuid(),
  scan_id         uuid not null references public.scans on delete cascade,
  check_name      text not null,
  category        text not null
                    check (category in ('headers', 'transport', 'ai', 'auth', 'cors', 'deps', 'endpoints', 'secrets')),
  severity        text not null
                    check (severity in ('critical', 'medium', 'low', 'info', 'pass')),
  result          text not null
                    check (result in ('pass', 'fail', 'warn')),
  title           text not null,
  method          text,
  duration_ms     int,
  description     text,
  what_we_did     text,
  remediation     text,
  first_seen_at   timestamptz not null default now(),
  metadata        jsonb
);

-- Used by the report page: filter by category or severity within a scan.
create index findings_scan_category_severity
  on public.findings (scan_id, category, severity);

alter table public.findings enable row level security;
```

- [ ] **Step 4: Create the badges migration**

Create `supabase/migrations/20260519000006_badges.sql`:

```sql
-- Public trust badges. One active badge per URL at a time.
-- Old badges remain as lapsed/revoked for audit trail.
create table public.badges (
  id              uuid primary key default gen_random_uuid(),
  url_id          uuid not null references public.urls on delete cascade,
  scan_id         uuid not null references public.scans on delete cascade,
  status          text not null
                    check (status in ('active', 'lapsed', 'revoked')),
  public_token    text not null unique,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

alter table public.badges enable row level security;
```

- [ ] **Step 5: Apply and verify**

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: three NOTICE lines, no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260519000005_findings.sql \
        supabase/migrations/20260519000006_badges.sql \
        supabase/tests/verify_schema.sql
git commit -m "feat: add findings and badges migration"
```

---

## Task 4: Activity log, integrations, webhook log, and API keys

**Files:**
- Create: `supabase/migrations/20260519000007_activity_log.sql`
- Create: `supabase/migrations/20260519000008_integrations.sql`
- Create: `supabase/migrations/20260519000009_webhook_log.sql`
- Create: `supabase/migrations/20260519000010_api_keys.sql`
- Modify: `supabase/tests/verify_schema.sql`

- [ ] **Step 1: Append assertions to verify_schema.sql**

```sql
DO $$
BEGIN
  -- Activity log
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_log'
  ), 'public.activity_log table missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'activity_log' AND indexname = 'activity_log_user_created'
  ), 'activity_log index missing';

  -- Integrations
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'integrations'
  ), 'public.integrations table missing';

  -- Webhook log
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'webhook_log'
  ), 'public.webhook_log table missing';

  -- API keys
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'api_keys'
  ), 'public.api_keys table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'api_keys'
      AND column_name = 'key_prefix'
  ), 'api_keys.key_prefix column missing';

  RAISE NOTICE 'Task 4 assertions passed: activity_log + integrations + webhook_log + api_keys';
END $$;
```

- [ ] **Step 2: Run verification — confirm it fails**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: `ERROR:  public.activity_log table missing`.

- [ ] **Step 3: Create the activity_log migration**

Create `supabase/migrations/20260519000007_activity_log.sql`:

```sql
-- Append-only event feed shown on the dashboard.
-- Payload shape varies by event_type — see spec for expected keys per type.
create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  url_id      uuid references public.urls on delete set null,
  scan_id     uuid references public.scans on delete set null,
  event_type  text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- Dashboard query: latest N events for a user.
create index activity_log_user_created
  on public.activity_log (user_id, created_at desc);

alter table public.activity_log enable row level security;
```

- [ ] **Step 4: Create the integrations migration**

Create `supabase/migrations/20260519000008_integrations.sql`:

```sql
-- Connected third-party services (GitHub OAuth, Vercel/Netlify webhooks, Slack OAuth).
-- Config jsonb must be encrypted at the application layer before insert —
-- the column stores ciphertext, not plaintext tokens.
create table public.integrations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  type                text not null
                        check (type in ('github', 'vercel', 'netlify', 'slack')),
  status              text not null default 'pending'
                        check (status in ('active', 'disconnected', 'pending')),
  config              jsonb not null default '{}',
  last_triggered_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Reuses set_updated_at() defined in migration 002.
create trigger integrations_set_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

alter table public.integrations enable row level security;
```

- [ ] **Step 5: Create the webhook_log migration**

Create `supabase/migrations/20260519000009_webhook_log.sql`:

```sql
-- Incoming deploy hook history. Append-only. Shown in the integrations screen.
create table public.webhook_log (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid not null references public.integrations on delete cascade,
  source          text not null,
  payload         jsonb not null,
  scan_id         uuid references public.scans on delete set null,
  action          text,
  status          text not null
                    check (status in ('SCAN_QUEUED', 'SCAN_DONE', 'IGNORED')),
  response_code   int,
  created_at      timestamptz not null default now()
);

alter table public.webhook_log enable row level security;
```

- [ ] **Step 6: Create the api_keys migration**

Create `supabase/migrations/20260519000010_api_keys.sql`:

```sql
-- User API keys for CI/programmatic scan triggering.
-- Raw key is never stored. key_hash holds the bcrypt hash (computed by the app).
-- key_prefix (first ~16 chars) is stored in plain for UI display only.
-- Rows are never hard-deleted; revoked_at marks revocation for audit trail.
create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  key_hash      text not null,
  key_prefix    text not null,
  name          text,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

alter table public.api_keys enable row level security;
```

- [ ] **Step 7: Apply and verify**

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: four NOTICE lines, no errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260519000007_activity_log.sql \
        supabase/migrations/20260519000008_integrations.sql \
        supabase/migrations/20260519000009_webhook_log.sql \
        supabase/migrations/20260519000010_api_keys.sql \
        supabase/tests/verify_schema.sql
git commit -m "feat: add activity_log, integrations, webhook_log, api_keys migrations"
```

---

## Task 5: RLS policies

**Files:**
- Create: `supabase/migrations/20260519000011_rls_policies.sql`
- Modify: `supabase/tests/verify_schema.sql`

Note: Column-level restrictions on findings for public scans (description/what_we_did/remediation should not be exposed to anon) are enforced at the API layer, not at the RLS layer, since PostgreSQL RLS only controls row visibility.

- [ ] **Step 1: Append RLS assertions to verify_schema.sql**

```sql
DO $$
BEGIN
  -- Check RLS is enabled on all tables
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'profiles' AND schemaname = 'public'),
    'RLS not enabled on profiles';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'urls' AND schemaname = 'public'),
    'RLS not enabled on urls';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'scans' AND schemaname = 'public'),
    'RLS not enabled on scans';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'findings' AND schemaname = 'public'),
    'RLS not enabled on findings';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'badges' AND schemaname = 'public'),
    'RLS not enabled on badges';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'activity_log' AND schemaname = 'public'),
    'RLS not enabled on activity_log';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'integrations' AND schemaname = 'public'),
    'RLS not enabled on integrations';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'webhook_log' AND schemaname = 'public'),
    'RLS not enabled on webhook_log';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'api_keys' AND schemaname = 'public'),
    'RLS not enabled on api_keys';

  -- Check that at least one policy exists per table
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'profiles') > 0,
    'No RLS policies on profiles';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'urls') > 0,
    'No RLS policies on urls';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'scans') > 0,
    'No RLS policies on scans';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'findings') > 0,
    'No RLS policies on findings';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'badges') > 0,
    'No RLS policies on badges';

  RAISE NOTICE 'Task 5 assertions passed: RLS enabled + policies present on all tables';
END $$;
```

- [ ] **Step 2: Run verification — confirm it fails**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: `ERROR:  No RLS policies on profiles` (tables exist, RLS enabled, but no policies yet).

- [ ] **Step 3: Create the RLS policies migration**

Create `supabase/migrations/20260519000011_rls_policies.sql`:

```sql
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
-- Users can see their own scans.
-- Anon can see scans marked is_public = true (for share links + badge lookups).
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
-- Users can see findings for their own scans.
-- Anon can see findings for public scans.
-- Column-level restrictions (hide description/remediation from anon) are
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
-- Users can see their own badges.
-- Anon can see active badges by public_token (for the badge embed endpoint).
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
```

- [ ] **Step 4: Apply and run full verification**

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected output — all five NOTICE lines, no errors:
```
NOTICE:  Task 1 assertions passed: extensions + profiles
NOTICE:  Task 2 assertions passed: urls + scans
NOTICE:  Task 3 assertions passed: findings + badges
NOTICE:  Task 4 assertions passed: activity_log + integrations + webhook_log + api_keys
NOTICE:  Task 5 assertions passed: RLS enabled + policies present on all tables
DO
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260519000011_rls_policies.sql \
        supabase/tests/verify_schema.sql
git commit -m "feat: add RLS policies for all tables"
```

---

## Task 6: Seed data

**Files:**
- Create: `supabase/seed.sql`

Seed creates one test URL, one completed scan, three findings (one critical, one medium, one pass), one active badge, two activity log entries, one Vercel integration, one webhook log entry, and one API key. It's safe to re-run (all inserts are conditional).

- [ ] **Step 1: Create seed.sql**

Create `supabase/seed.sql`:

```sql
-- Local development seed data.
-- Applied automatically by: npx supabase db reset
-- Requires: at least one user created via the Supabase Studio (http://localhost:54323)
--           before running, OR create one via: npx supabase auth create-user

do $$
declare
  v_user_id         uuid;
  v_url_id          uuid;
  v_scan_id         uuid;
  v_integration_id  uuid;
begin
  -- Find the first user in auth.users
  select id into v_user_id from auth.users order by created_at limit 1;

  if v_user_id is null then
    raise notice 'SEED SKIPPED: No users found. Create a user via http://localhost:54323 first.';
    return;
  end if;

  -- Update profile to monitor plan
  update public.profiles
  set plan = 'monitor', name = 'Dev User'
  where id = v_user_id;

  -- URL
  insert into public.urls (user_id, url, verified, verification_token, verification_method, verified_at, label, monitoring_mode)
  values (
    v_user_id, 'acme-app.vercel.app', true,
    'vc-verify-dev-seed-token-001', 'dns', now() - interval '30 days',
    'production', 'continuous'
  )
  on conflict do nothing
  returning id into v_url_id;

  -- If URL already existed (on conflict), look it up
  if v_url_id is null then
    select id into v_url_id from public.urls
    where user_id = v_user_id and url = 'acme-app.vercel.app';
  end if;

  -- Scan
  insert into public.scans (
    url_id, user_id, scan_type, status, grade, score,
    triggered_by, rate_limit_mode, checks_total,
    started_at, completed_at, duration_ms, scanner_version, is_public
  )
  values (
    v_url_id, v_user_id, 'active', 'completed', 'B+', 78.50,
    'manual', 'polite', 180,
    now() - interval '3 days',
    now() - interval '3 days' + interval '58 seconds',
    58400, '1.0.0', true
  )
  returning id into v_scan_id;

  -- Findings (critical, medium, pass)
  insert into public.findings (scan_id, check_name, category, severity, result, title, method, duration_ms, description, what_we_did, remediation, first_seen_at)
  values
  (
    v_scan_id, 'ai.prompt_injection', 'ai', 'critical', 'fail',
    'Prompt injection bypass /api/chat',
    'POST /api/chat · 40 payloads', 1821,
    'Your AI endpoint accepts user input that can override the system prompt — leaking instructions or invoking tools the user should not have access to.',
    'Sent 40 adversarial payloads against POST /api/chat. 6 of 40 succeeded in overriding system instructions or extracting the prompt.',
    'Move untrusted input into a separate message with structured delimiters, and add a server-side guard prompt that rejects instruction-override attempts before tool calls.',
    now() - interval '3 days'
  ),
  (
    v_scan_id, 'headers.csp', 'headers', 'medium', 'fail',
    'Missing Content-Security-Policy header',
    'GET /, /login → policy parse', 412,
    'No CSP is set, so any injected script tag on your domain runs with full privileges.',
    'Read response headers for GET / and three sub-routes. Found Strict-Transport-Security ✓, but Content-Security-Policy ✗.',
    'Add a strict CSP to next.config.js with ''self'' defaults.',
    now() - interval '3 days'
  ),
  (
    v_scan_id, 'tls.hsts', 'transport', 'pass', 'pass',
    'TLS / HSTS — transport layer secure',
    'HEAD / → header inspect', 241,
    'TLS 1.3 negotiated, HSTS set with max-age=31536000; includeSubDomains; preload. Certificate valid.',
    null, null,
    now() - interval '30 days'
  );

  -- Badge
  insert into public.badges (url_id, scan_id, status, public_token, expires_at)
  values (v_url_id, v_scan_id, 'active', 'dev-public-badge-token-001', now() + interval '27 days');

  -- Activity log
  insert into public.activity_log (user_id, url_id, scan_id, event_type, payload)
  values
  (
    v_user_id, v_url_id, v_scan_id, 'scan_completed',
    jsonb_build_object('grade', 'B+', 'prev_grade', 'B', 'checks_total', 180, 'issues_resolved', 2)
  ),
  (
    v_user_id, v_url_id, v_scan_id, 'badge_renewed',
    jsonb_build_object('expires_at', (now() + interval '27 days')::text, 'public_token', 'dev-public-badge-token-001')
  );

  -- Vercel integration
  insert into public.integrations (user_id, type, status, config, last_triggered_at)
  values (
    v_user_id, 'vercel', 'active',
    '{"webhook_secret": "dev-webhook-secret-001", "projects": [{"name": "acme-app", "webhook_url": "http://localhost:8000/hooks/deploy/dev"}]}'::jsonb,
    now() - interval '3 days'
  )
  returning id into v_integration_id;

  -- Webhook log entry
  insert into public.webhook_log (integration_id, source, payload, scan_id, action, status, response_code)
  values (
    v_integration_id, 'Vercel',
    '{"type": "deployment.succeeded", "project": "acme-app", "branch": "main"}'::jsonb,
    v_scan_id, 'prod deploy · scan complete', 'SCAN_DONE', 200
  );

  -- API key (hash is computed by app in production; pgcrypto used here for local seed only)
  insert into public.api_keys (user_id, key_hash, key_prefix, name)
  values (
    v_user_id,
    crypt('vc_live_sk_devtestkey_local', gen_salt('bf')),
    'vc_live_sk_devt',
    'Local dev test key'
  );

  raise notice 'SEED COMPLETE: data created for user %', v_user_id;
end;
$$;
```

- [ ] **Step 2: Apply migrations and seed**

```bash
npx supabase db reset
```

Expected output ends with:
```
NOTICE:  SEED COMPLETE: data created for user <uuid>
```

If you see `SEED SKIPPED`, create a user first:
1. Open http://localhost:54323 (Supabase Studio)
2. Go to Authentication → Users → Add user
3. Enter any email + password
4. Re-run: `npx supabase db reset`

- [ ] **Step 3: Verify seed data via Studio**

Open http://localhost:54323, navigate to Table Editor, and confirm:
- `profiles`: 1 row with `plan = 'monitor'`
- `urls`: 1 row for `acme-app.vercel.app`, `verified = true`
- `scans`: 1 row with `status = 'completed'`, `grade = 'B+'`
- `findings`: 3 rows (1 critical, 1 medium, 1 pass)
- `badges`: 1 row with `status = 'active'`
- `activity_log`: 2 rows
- `integrations`: 1 row (Vercel, active)
- `webhook_log`: 1 row (SCAN_DONE)
- `api_keys`: 1 row

- [ ] **Step 4: Run full schema verification one final time**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/tests/verify_schema.sql
```

Expected: all five NOTICE lines, no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add seed data for local development"
```

---

## Done

At this point:
- All 11 migration files are applied and verified
- RLS is enabled on all 9 tables with correct policies
- Seed data is available for local dev
- `npx supabase db reset` reproduces the full schema + seed from scratch

Next step in the CLAUDE.md build order: **Step 2 — Next.js auth flow** (sign up, sign in, middleware).
