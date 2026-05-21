-- Set is_admin = true for patrickcampbell@workflowautomationnetwork.com.au
--
-- This runs after migration 012 which adds the is_admin column.
-- Safe to re-run (idempotent).

update public.profiles
set is_admin = true
where id = (
  select id
  from auth.users
  where email = 'patrickcampbell@workflowautomationnetwork.com.au'
  limit 1
);
