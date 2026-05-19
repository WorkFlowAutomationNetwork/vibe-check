-- All check results from a scan. description/what_we_did/remediation are nullable
-- for low-detail pass checks; populated for notable findings shown in the report UI.
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

-- Report page: filter/sort by category or severity within a scan.
create index findings_scan_category_severity
  on public.findings (scan_id, category, severity);

alter table public.findings enable row level security;
