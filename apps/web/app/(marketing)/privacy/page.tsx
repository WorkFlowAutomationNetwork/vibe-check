import type { Metadata } from 'next'
import '../landing.css'
import LegalShell from '@/components/marketing/LegalShell'

export const metadata: Metadata = {
  title: 'Privacy Policy — Vibe-Check',
  description: 'What data Vibe-Check collects, why, who processes it, how long we keep it, and your rights.',
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated="[EFFECTIVE DATE]">
      <p>
        This Privacy Policy explains how <strong>[LEGAL ENTITY NAME]</strong>
        (&ldquo;Vibe-Check&rdquo;, &ldquo;we&rdquo;) collects, uses, and protects personal
        data when you use the Service. The data controller is{' '}
        <strong>[LEGAL ENTITY NAME, ADDRESS]</strong>.
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
        <li><strong>Supabase</strong> — database, authentication, and file storage. <span style={{ fontFamily: 'var(--font-mono)' }}>[link DPA]</span></li>
        <li><strong>Stripe</strong> — payment processing. <span style={{ fontFamily: 'var(--font-mono)' }}>[link DPA]</span></li>
        <li><strong>Resend</strong> — transactional email delivery. <span style={{ fontFamily: 'var(--font-mono)' }}>[link DPA]</span></li>
        <li><strong>Fly.io</strong> — runs the scanning service. <span style={{ fontFamily: 'var(--font-mono)' }}>[link DPA]</span></li>
        <li><strong>Vercel</strong> — hosts the web application and processes all visitor/user HTTP traffic. <span style={{ fontFamily: 'var(--font-mono)' }}>[link DPA]</span></li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h3>4. International transfers</h3>
      <p>
        Our scanning infrastructure runs in <strong>Australia (Sydney, on Fly.io)</strong>.
        Our web application is hosted on Vercel and our database on Supabase, whose exact
        processing region(s) are <strong>[CONFIRM SUPABASE + VERCEL REGION]</strong>. Where
        personal data of EU/UK users is transferred outside the EEA/UK, we rely on appropriate
        safeguards such as the Standard Contractual Clauses.{' '}
        <strong>[Confirm transfer mechanism with counsel.]</strong>
      </p>

      <h3>5. How long we keep it (retention)</h3>
      <ul>
        <li><strong>Scan findings &amp; metadata:</strong> kept for the lifetime of your account so your report history remains accessible. When you delete your account, all findings are purged as described below.</li>
        <li><strong>Report PDFs:</strong> stored for the lifetime of your account and deleted when your account is deleted.</li>
        <li><strong>Activity &amp; webhook logs:</strong> retained for <strong>30 days</strong>, then purged.</li>
        <li><strong>Deleted accounts:</strong> URLs, scans, findings, badges, and stored report PDFs are hard-deleted or irreversibly anonymised within <strong>30 days</strong> of account deletion.</li>
      </ul>

      <h3>6. Your rights</h3>
      <p>
        Depending on your location, you have rights to access, export, correct, delete, and
        object to processing of your personal data, and to withdraw consent. You can delete
        your account and associated data from the app, or contact us to exercise any right. We
        respond within the period required by applicable law.
      </p>

      <h3>7. Payments &amp; PCI</h3>
      <p>
        Payments are handled by Stripe using its hosted Checkout and Billing Portal. Card data
        never touches our servers, keeping us within PCI SAQ-A scope. We never see or store
        your card details.
      </p>

      <h3>8. Security</h3>
      <p>
        We apply technical and organisational measures appropriate to the sensitivity of the
        data we hold, including access controls, encryption in transit, and least-privilege
        handling of credentials. No system is perfectly secure; we cannot guarantee absolute
        security.
      </p>

      <h3>9. Contact &amp; complaints</h3>
      <p>
        Data protection contact: <strong>[LEGAL ENTITY / DPO NAME]</strong>,{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>privacy@vibe-check-app.com</span>,{' '}
        <strong>[POSTAL ADDRESS]</strong>. EU/UK users may also lodge a complaint with their
        local supervisory authority.
      </p>
    </LegalShell>
  )
}
