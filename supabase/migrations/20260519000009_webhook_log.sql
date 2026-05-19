-- Incoming deploy hook history. Append-only.
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
