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

-- DB-enforced: one pending/running scan per URL at a time.
create unique index one_active_scan_per_url
  on public.scans (url_id)
  where status in ('pending', 'running');

alter table public.scans enable row level security;
