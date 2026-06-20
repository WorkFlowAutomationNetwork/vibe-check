-- supabase/migrations/20260620000024_waitlist.sql
-- Launch-notify capture for the prelaunch coming-soon gate.
-- See docs/superpowers/specs/2026-06-20-prelaunch-gate-design.md

create table public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text not null default 'prelaunch',
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
-- No public policies: inserts happen via the service role only, matching the
-- urls/scans/findings pattern.
