-- Enforce one integration row per user per type so upserts are safe.
alter table public.integrations
  add constraint integrations_user_type_unique unique (user_id, type);
