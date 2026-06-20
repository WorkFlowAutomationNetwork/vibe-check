-- GitHub committed-secret scanning: installations, repos, and (for Plans B/C)
-- repo scans + redacted findings. See
-- docs/superpowers/specs/2026-06-20-github-committed-secret-scan-design.md

create table public.github_installations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  installation_id  bigint not null unique,
  account_login    text not null,
  account_type     text not null check (account_type in ('user', 'org')),
  status           text not null default 'active'
                     check (status in ('active', 'suspended', 'revoked')),
  created_at       timestamptz not null default now()
);

create table public.repos (
  id               uuid primary key default gen_random_uuid(),
  installation_id  uuid not null references public.github_installations on delete cascade,
  user_id          uuid not null references auth.users on delete cascade,
  github_repo_id   bigint not null,
  full_name        text not null,
  default_branch   text not null default 'main',
  last_scanned_sha text,
  last_scan_at     timestamptz,
  status           text not null default 'active' check (status in ('active', 'removed')),
  created_at       timestamptz not null default now(),
  unique (installation_id, github_repo_id)
);

create table public.repo_scans (
  id              uuid primary key default gen_random_uuid(),
  repo_id         uuid not null references public.repos on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  mode            text not null check (mode in ('full', 'incremental')),
  status          text not null default 'pending'
                    check (status in ('pending', 'running', 'completed', 'failed')),
  base_sha        text,
  head_sha        text,
  commits_scanned int,
  secrets_found   int,
  triggered_by    text not null default 'manual' check (triggered_by in ('manual', 'webhook')),
  started_at      timestamptz,
  completed_at    timestamptz,
  scanner_version text,
  error           text,
  created_at      timestamptz not null default now()
);

create table public.repo_findings (
  id            uuid primary key default gen_random_uuid(),
  repo_scan_id  uuid not null references public.repo_scans on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  rule_id       text not null,
  severity      text not null check (severity in ('critical', 'medium', 'low', 'info')),
  title         text not null,
  description   text,
  file_path     text,
  commit_sha    text,
  line_start    int,
  fingerprint   text,
  match_preview text,
  commit_author text,
  committed_at  timestamptz,
  remediation   text,
  first_seen_at timestamptz not null default now()
);

create index repos_user_idx on public.repos (user_id);
create index repo_scans_repo_idx on public.repo_scans (repo_id);
create index repo_findings_scan_idx on public.repo_findings (repo_scan_id);

alter table public.github_installations enable row level security;
alter table public.repos enable row level security;
alter table public.repo_scans enable row level security;
alter table public.repo_findings enable row level security;

-- Owners can read their own rows. Writes happen via the service role (which
-- bypasses RLS), matching the urls/scans/findings pattern — so only SELECT
-- policies are defined here.
create policy github_installations_select_own on public.github_installations
  for select using (auth.uid() = user_id);
create policy repos_select_own on public.repos
  for select using (auth.uid() = user_id);
create policy repo_scans_select_own on public.repo_scans
  for select using (auth.uid() = user_id);
create policy repo_findings_select_own on public.repo_findings
  for select using (auth.uid() = user_id);
