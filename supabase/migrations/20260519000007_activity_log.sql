-- Append-only event feed shown on the dashboard.
-- Written by service role only (API routes, scanner). No client INSERT policy.
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
