import type { Metadata } from 'next'
import '../landing.css'
import LegalShell from '@/components/marketing/LegalShell'

export const metadata: Metadata = {
  title: 'Terms of Service — Vibe-Check',
  description: 'The terms that govern your use of Vibe-Check, including authorization-to-scan, disclaimers, and limitation of liability.',
}

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" lastUpdated="7 July 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between you
        and <strong>WorkFlow Automation Network (ABN 43 637 993 462)</strong>, a sole trader
        based in Victoria, Australia (&ldquo;Vibe-Check&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;), governing your access to and use of the
        Vibe-Check website, scanning service, reports, and trust badge (together, the
        &ldquo;Service&rdquo;). By creating an account or using the Service you agree to
        these Terms. If you do not agree, do not use the Service.
      </p>

      <h3>1. Authorization to scan (you are responsible)</h3>
      <p>
        Vibe-Check sends network requests to, and reads data from, the systems you submit
        for scanning. You are solely responsible for ensuring you are permitted to do this.
      </p>
      <p className="clause-quote">
        You represent and warrant that you own, or are expressly authorised by the owner to
        test, every URL and system you submit for scanning. You will not submit any target
        you are not authorised to test. You agree to indemnify, defend, and hold Vibe-Check
        and its operators harmless against any claim, loss, liability, or expense (including
        reasonable legal fees) arising from scans you initiate, including any claim that a
        scan was unauthorised.
      </p>
      <p>
        Scanning systems you do not own or are not authorised to test may violate laws
        including the U.S. Computer Fraud and Abuse Act (CFAA), the UK Computer Misuse Act,
        and equivalents in other jurisdictions. Our ownership-verification step is a control,
        not a substitute for your responsibility.
      </p>

      <h3>2. No guarantee of security</h3>
      <p className="clause-quote">
        Vibe-Check provides automated security assessments on a best-effort, &ldquo;AS
        IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis. The scans identify a limited set of
        common, automatically-detectable issues. A passing grade, badge, or report does NOT
        guarantee that your site is secure, free of vulnerabilities, or compliant with any
        standard. New vulnerabilities emerge constantly and many classes of issue cannot be
        detected automatically. The reports are informational suggestions to help you improve
        your security; they are not a warranty, certification, or guarantee of safety. You
        remain solely responsible for the security of your systems.
      </p>

      <h3>3. Disclaimers &amp; limitation of liability</h3>
      <p>
        To the maximum extent permitted by law, Vibe-Check disclaims all implied warranties,
        including merchantability, fitness for a particular purpose, and non-infringement.
      </p>
      <p className="clause-quote">
        To the maximum extent permitted by law, Vibe-Check is not liable for any security
        incident, breach, data loss, or damage arising from vulnerabilities — whether or not
        they were detected by a scan — or from your reliance on any report, grade, or badge.
        We are not liable for indirect, incidental, special, consequential, or punitive
        damages, including any loss resulting from a vulnerability not detected, a false
        negative, or reliance on a passing grade or badge.
      </p>
      <p>
        Our total aggregate liability for any claim arising out of or relating to the Service
        is limited to the greater of (a) the fees you paid to Vibe-Check in the twelve (12)
        months preceding the event giving rise to the claim, or (b) <strong>AUD 50</strong> for
        free-tier users. Some jurisdictions do not allow certain limitations, so parts of this
        section may not apply to you.
      </p>

      <h3>4. Acceptable use</h3>
      <ul>
        <li>You may not use the Service to scan, probe, or attack any system for which you lack authorisation.</li>
        <li>You may not use the Service as an attack tool against third parties, or to facilitate any unlawful activity.</li>
        <li>You may not attempt to overload, disrupt, reverse-engineer, or circumvent the Service or its scanning limits.</li>
        <li>
          We reserve the right to refuse, throttle, or terminate any scan — for example
          targets that resolve to internal, shared, or third-party infrastructure — and to
          suspend or terminate accounts that we reasonably believe are abusing the Service.
        </li>
      </ul>

      <h3>5. The trust badge</h3>
      <p>
        The Vibe-Check badge reflects the result of a point-in-time, automated scan only. It
        is not a certification, audit, or guarantee of security. A badge may lapse or be
        revoked (for example when a scan expires or a re-scan changes the result), and a
        badged site may still be vulnerable. You may not display a badge in a way that
        misrepresents its meaning or implies a guarantee. Third parties who rely on a badge do
        so at their own risk, and the limitations in Sections 2 and 3 apply to that reliance.
      </p>

      <h3>6. Service, changes &amp; availability</h3>
      <p>
        The Service is provided on a best-effort basis and may experience downtime,
        interruption, or change. We may add, remove, or change scanning tools, templates, and
        grading methodology over time; grades are not guaranteed to be stable across scanner
        versions. We may modify these Terms; material changes will be notified, and continued
        use after changes take effect constitutes acceptance.
      </p>

      <h3 id="refund">7. Payments &amp; refunds</h3>
      <p>
        Paid plans are billed through Stripe. We never receive or store your full card details.
      </p>
      <p>
        Our services come with guarantees under the Australian Consumer Law (&ldquo;ACL&rdquo;)
        that cannot be excluded. You are entitled to a remedy for a major failure of the Service
        and to have the Service re-supplied if it fails to be of acceptable quality.
      </p>
      <p>
        In addition to your ACL rights, our practical policy is:
      </p>
      <ul>
        <li>
          <strong>One-off scan (Starter):</strong> if your scan fails to complete or produces no
          report due to a fault on our end, contact us within 14 days and we will re-run the scan
          at no charge or issue a full refund. We do not offer refunds for scans that complete
          successfully — the grade is an automated, point-in-time result and may not match your
          expectations.
        </li>
        <li>
          <strong>Monthly subscription (Monitor):</strong> you may cancel at any time. No further
          charges are made after cancellation. We do not offer pro-rata refunds for unused days in
          a billing period, except where the Service was materially unavailable through our fault.
        </li>
      </ul>
      <p>
        Nothing in these Terms limits or excludes any right or remedy you have under the ACL or
        any other applicable consumer protection law.
      </p>

      <h3>8. Termination</h3>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or
        terminate access for breach of these Terms. On account deletion we handle your data as
        described in the{' '}
        <a href="/privacy" style={{ color: 'var(--violet)' }}>Privacy Policy</a>.
      </p>

      <h3>9. Governing law</h3>
      <p>
        These Terms are governed by the laws of <strong>Victoria, Australia</strong>,
        without regard to conflict-of-laws rules, and the courts of{' '}
        <strong>Victoria</strong> have exclusive jurisdiction, except where mandatory local
        law (including the Australian Consumer Law) provides otherwise.
      </p>

      <h3>10. Contact</h3>
      <p>
        Questions about these Terms: <strong>WorkFlow Automation Network (ABN 43 637 993 462)</strong>,{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>legal@vibe-check-app.com</span>. A postal
        address for formal notices is available on request.
      </p>
    </LegalShell>
  )
}
