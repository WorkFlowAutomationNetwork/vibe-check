-- Migration 36: include GitHub repo scanning in the one-off Starter plan.
--
-- Product decision 2026-07-08: a one-off Starter purchase should also let the
-- buyer scan a GitHub repo, not just their live URL. Starter now gets 1 connected
-- repo + integrations enabled for its 30-day window (was Monitor-only, max_repos 0).
-- Matches Starter's single-URL scope. Monitor is unchanged (5 repos). An expired
-- Starter reverts to free via user_plan(), so it loses integrations automatically.

update public.plan_limits
   set max_repos = 1,
       can_integrations = true
 where plan = 'starter';
