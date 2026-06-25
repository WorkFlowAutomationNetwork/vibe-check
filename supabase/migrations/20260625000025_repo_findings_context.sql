-- Richer context on committed-secret findings so a report can be
-- copy/pasted into an AI coding agent and actually acted on:
-- - variable_name: best-effort key name extracted from the matched line
--   (never the secret value itself — see github_secrets_rules.py).
-- - still_live: whether the secret is still present in the file as of the
--   scan's HEAD, vs. only in older git history. Changes remediation urgency.

alter table public.repo_findings
  add column variable_name text,
  add column still_live    boolean not null default false;
