import type { Metadata } from 'next'
import '../landing.css'
import LegalShell from '@/components/marketing/LegalShell'

export const metadata: Metadata = {
  title: 'Privacy Policy — Vibe-Check',
  description: 'What data Vibe-Check collects, why, who processes it, how long we keep it, and your rights.',
}

const DPA = { color: 'var(--violet)' }

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated="7 July 2026">
      <p>
        This Privacy Policy explains how <strong>WorkFlow Automation Network (ABN 43 637 993
        462)</strong>, a sole trader based in Victoria, Australia that operates Vibe-Check
        (&ldquo;Vibe-Check&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), collects, uses, and
        protects personal data when you use the Service. For the purposes of the Australian{' '}
        <em>Privacy Act 1988</em> (Cth) and, where applicable, the EU/UK General Data Protection
        Regulation, the data controller is <strong>WorkFlow Automation Network (ABN 43 637 993
        462), Victoria, Australia</strong>. You can reach us at{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>privacy@vibe-check-app.com</span>.
      </p>

      <h3>1. What we collect</h3>
      <ul>
        <li><strong>Account data:</strong> your email address and, optionally, your name.</li>
        <li><strong>Target data:</strong> the URLs you submit, ownership-verification tokens, and verification method.</li>
        <li><strong>Scan results:</strong> security findings, grades, and scan history for your targets. We store likelihood assessments and aggregate counts — not the contents of data read from your systems.</li>
        <li><strong>Activity &amp; logs:</strong> activity log, webhook log, and basic usage/IP telemetry used for security, abuse prevention, and operating the Service.</li>
        <li><strong>Billing data:</strong> Stripe billing metadata (plan, subscription status, customer/subscription identifiers). We do <strong>not</strong> store your card number — Stripe handles card data; we never see it.</li>
      </ul>

      <h3>2. Why we use it (legal bases)</h3>
      <ul>
        <li><strong>To perform our contract with you</strong> — running scans, producing reports, managing your account and billing.</li>
        <li><strong>Legitimate interests</strong> — securing and improving the Service, preventing abuse and fraud.</li>
        <li><strong>Consent</strong> — only where required, e.g. any optional marketing email (which you can withdraw at any time).</li>
      </ul>

      <h3>3. Sub-processors</h3>
      <p>We share data with the following processors strictly to operate the Service:</p>
      <ul>
        <li><strong>Supabase</strong> — database, authentication, and file storage. <a href="https://supabase.com/legal/dpa" target="_blank" rel="noopener noreferrer" style={DPA}>DPA</a></li>
        <li><strong>Stripe</strong> — payment processing. <a href="https://stripe.com/legal/dpa" target="_blank" rel="noopener noreferrer" style={DPA}>DPA</a></li>
        <li><strong>Resend</strong> — transactional email delivery. <a href="https://resend.com/legal/dpa" target="_blank" rel="noopener noreferrer" style={DPA}>DPA</a></li>
        <li><strong>Fly.io</strong> — runs the scanning service. <a href="https://fly.io/legal/dpa/" target="_blank" rel="noopener noreferrer" style={DPA}>DPA</a></li>
        <li><strong>Vercel</strong> — hosts the web application, processes all visitor/user HTTP traffic, and provides cookieless usage analytics. <a href="https://vercel.com/legal/dpa" target="_blank" rel="noopener noreferrer" style={DPA}>DPA</a></li>
        <li><strong>Cloudflare</strong> — provides the Turnstile bot-protection challenge on our sign-in, sign-up, and password-reset forms, which processes your IP address and challenge interaction to distinguish humans from bots. <a href="https://www.cloudflare.com/cloudflare-customer-dpa/" target="_blank" rel="noopener noreferrer" style={DPA}>DPA</a></li>
      </ul>
      <p>We do not sell your personal data, and we do not use it for advertising.</p>

      <h3>4. International transfers</h3>
      <p>
        Our scanning infrastructure runs in <strong>Australia (Sydney, on Fly.io)</strong>, our
        database is hosted on Supabase in <strong>Australia (Sydney, ap-southeast-2)</strong>, and
        our web application is hosted on Vercel in <strong>Australia (Sydney, syd1)</strong>. Some
        sub-processors (Stripe, Resend, Cloudflare, and Vercel&rsquo;s global edge network) may
        process limited data outside Australia. Where personal data of EU/UK users is transferred
        outside the EEA/UK, we rely on appropriate safeguards — principally the European
        Commission&rsquo;s Standard Contractual Clauses and the UK International Data Transfer
        Addendum, as incorporated into each sub-processor&rsquo;s DPA linked above.
      </p>

      <h3>5. Cookies &amp; analytics</h3>
      <p>
        We use only strictly-necessary cookies and do not use advertising or cross-site tracking
        cookies, so we do not show a cookie-consent banner:
      </p>
      <ul>
        <li><strong>Authentication cookies</strong> (set by Supabase) keep you signed in. Without them the Service cannot function.</li>
        <li><strong>Pre-launch access cookie</strong> remembers that you entered the early-access password, while the site is gated.</li>
      </ul>
      <p>
        For usage analytics we use <strong>Vercel Web Analytics</strong>, which is privacy-first
        and <strong>cookieless</strong>: it records aggregate page views and performance without
        cookies, without cross-site tracking, and without building a profile of you. Cloudflare
        Turnstile (see above) may set a short-lived challenge token strictly to run the
        anti-bot check.
      </p>

      <h3>6. How long we keep it (retention)</h3>
      <ul>
        <li><strong>Scan findings &amp; metadata:</strong> kept for the lifetime of your account so your report history remains accessible. When you delete your account, all findings are purged as described below.</li>
        <li><strong>Report PDFs:</strong> stored for the lifetime of your account and deleted when your account is deleted.</li>
        <li><strong>Activity &amp; webhook logs:</strong> retained for <strong>30 days</strong>, then purged.</li>
        <li><strong>Deleted accounts:</strong> URLs, scans, findings, badges, and stored report PDFs are hard-deleted or irreversibly anonymised within <strong>30 days</strong> of account deletion.</li>
      </ul>

      <h3>7. Your rights</h3>
      <p>
        Depending on your location, you have rights to access, export, correct, delete, and
        object to processing of your personal data, and to withdraw consent. You can delete
        your account and associated data from the app, or contact us to exercise any right. We
        respond within the period required by applicable law.
      </p>

      <h3>8. Payments &amp; PCI</h3>
      <p>
        Payments are handled by Stripe using its hosted Checkout and Billing Portal. Card data
        never touches our servers, keeping us within PCI SAQ-A scope. We never see or store
        your card details.
      </p>

      <h3>9. Security &amp; data breaches</h3>
      <p>
        We apply technical and organisational measures appropriate to the sensitivity of the
        data we hold, including access controls, encryption in transit, and least-privilege
        handling of credentials. No system is perfectly secure; we cannot guarantee absolute
        security. If a data breach occurs that is likely to result in serious harm, we will
        notify affected individuals and the Office of the Australian Information Commissioner as
        required by the Notifiable Data Breaches scheme (and equivalent obligations for EU/UK
        users).
      </p>

      <h3>10. Children</h3>
      <p>
        The Service is intended for businesses and adults. It is not directed at children, and
        we do not knowingly collect personal data from anyone under 16. If you believe a child
        has provided us personal data, contact us and we will delete it.
      </p>

      <h3>11. Changes to this policy</h3>
      <p>
        We may update this Privacy Policy from time to time. We will revise the &ldquo;last
        updated&rdquo; date above and, for material changes, take reasonable steps to notify you.
      </p>

      <h3>12. Contact &amp; complaints</h3>
      <p>
        Privacy contact: <strong>WorkFlow Automation Network (ABN 43 637 993 462)</strong>,{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>privacy@vibe-check-app.com</span>. A
        postal address for formal notices is available on request. If you are not satisfied with
        our response, you may lodge a complaint with the Office of the Australian Information
        Commissioner (<span style={{ fontFamily: 'var(--font-mono)' }}>oaic.gov.au</span>); EU/UK
        users may also complain to their local supervisory authority.
      </p>
    </LegalShell>
  )
}
