## A list of final check items before launching

### Email & DNS (Cloudflare)
- Set up Cloudflare Email Routing for `vibe-check-app.com` — forward all four aliases to `patrickcampbell@workflowautomationnetwork.com.au`:
  - `support@vibe-check-app.com` — general support & billing queries
  - `legal@vibe-check-app.com` — terms of service queries
  - `privacy@vibe-check-app.com` — data rights / GDPR requests
  - `security@vibe-check-app.com` — vulnerability reports & scan traffic questions
- Verify each alias actually delivers (send a test from an external mailbox to each one)
- Confirm Resend sending domain (`vibe-check-app.com`) is verified in Cloudflare DNS (SPF, DKIM, DMARC records present)
- Update `TERMS_VERSION` constant in `apps/web/app/(auth)/sign-up/page.tsx` from `[TERMS-VERSION-DATE]` to the actual effective date once legal is finalised

### Supabase — branded transactional emails
- In Supabase dashboard → Authentication → Email Templates → configure custom SMTP to use Resend so that confirmation, password-reset, and magic-link emails come from `noreply@vibe-check-app.com` with your branding (not Supabase's generic sender):
  - SMTP host: `smtp.resend.com`
  - Port: `465` (SSL)
  - Username: `resend`
  - Password: your Resend API key
  - Sender: `Vibe-Check <noreply@vibe-check-app.com>`
- After setting up, trigger a password-reset to verify it arrives from the custom domain with correct formatting

### Vercel — environment variables
- Ensure `NEXT_PUBLIC_APP_URL=https://vibe-check-app.com` is set in Vercel project settings (used by the badge embed snippets — falls back to the hardcoded default but explicit is safer)

### Stripe — go live
- Create live-mode products in Stripe dashboard (Starter **$15** one-off, Monitor **$35/mo** — post-2026-07-01 pricing-v2, NOT the old $9/$19) with matching `lookup_key` values (`starter_one_off`, `monitor_monthly`)
- Swap `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` in Vercel to live-mode keys
- Re-register the Stripe webhook endpoint in live mode (`https://vibe-check-app.com/api/billing/stripe-webhook`) for events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

- Home page features reflect real site features - noting things it says no account required ect does that flow actually work? 
- sense check all security rules and features - ideally some sort of tracking for for ongoing and continous security scans 
- Apply migration `20260702000033_rate_limits.sql` to prod (rate limiter — built 2026-07-02, fails open until applied so limits stay inert until then). See `Security-feedback.md` §1c.
- Enable Supabase captcha (hCaptcha/Turnstile) for sign-up: dashboard → Auth → Bot & Abuse Protection, then pass the token in `sign-up/page.tsx`'s `signUp()` options. Sign-up abuse otherwise relies only on Supabase's built-in per-IP limits.
- share info on socials like reddit, linkedin, use hyperframes to make a video or sense check the saved reddit video i have
- ensure all t's and c's, privacy policy, exemption from ownership of secutity, data retention ect is completed - have Amy sense check, plus the trust page to clearly ouline how everything works 
- Complete minimum 10 tests of each kind
- review tech stack to ensure it is able to handle additional load and understand when upgrades to services are required 
- ensure all documentation is completed - should save this till the end
- decide on api intergration? - can be a post launch addition as part of the road map
- test all authentication methods - ie dns, adding file, adding code to ensure they all work on at least 3 sites 
- review all auto emails for things like formatting ect with custom domain names 
- documentation/how to guide
- make decisions re making an API - decide if this can be a ship after solution as an update
- decisions around roadmaps?
Password reset emails ect shoudl come through resender rather than supabase if possible or ahve custom branded emails through supabase
- woudl prefer magic link or something to increase security rather than fituing out 2fa. 