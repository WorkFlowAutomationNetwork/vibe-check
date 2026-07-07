# Supabase Auth email templates

Branded HTML for the transactional emails **Supabase Auth** sends (confirm signup,
password reset, email change). These are *not* consumed by app code — Supabase renders
them server-side. This folder is the version-controlled **source of truth**; the live
copies live in the Supabase dashboard and must be pasted in by hand.

Style matches `apps/web/lib/email/templates/welcome.ts` (the Resend-sent transactional
emails) so all Vibe-Check mail looks consistent.

## Where to paste

Supabase dashboard → **Authentication → Emails → Templates**, pick the template, set the
subject, replace the message body with the file contents, Save.

| File | Template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | `Confirm your email — Vibe-Check` |
| `reset-password.html` | Reset Password | `Reset your password — Vibe-Check` |
| `change-email.html` | Change Email Address | `Confirm your new email — Vibe-Check` |

The other default templates (Magic Link, Invite, Reauthentication) aren't used by the
current flows — brand them later if those flows get added.

## Variables

Supabase uses Go templating. The ones referenced here:

- `{{ .ConfirmationURL }}` — the action link (confirm / reset / change).
- `{{ .NewEmail }}` — the requested new address (change-email only).
- Also available: `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .Email }}`.

## When editing

Edit the file here first, commit, then paste into the dashboard — keep the two in sync so
the repo stays the source of truth.
