-- Connected third-party services (GitHub OAuth, Vercel/Netlify webhooks, Slack OAuth).
-- config jsonb is encrypted at the application layer before insert.
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
