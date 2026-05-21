import type { Metadata } from 'next'
import Link from 'next/link'
import '../landing.css'

export const metadata: Metadata = {
  title: 'Pricing — Vibe-Check',
  description: 'Free passive scan forever. $9 for a full active audit. $19/mo for continuous monitoring. No BS.',
}

export default function PricingPage() {
  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="logo">
            <div className="logo-mark">✓<span className="pulse" /></div>
            <span>Vibe-Check</span>
          </Link>
          <div className="nav-links">
            <a href="/#how">How it works</a>
            <Link href="/pricing" style={{ color: 'var(--ink)', fontWeight: 600 }}>Pricing</Link>
            <Link href="/sign-in">Sign in</Link>
          </div>
          <div className="nav-cta">
            <Link href="/sign-up" className="btn-primary">Run free scan <span className="arr">→</span></Link>
          </div>
        </div>
      </nav>

      <section className="block" style={{ paddingTop: 80 }}>
        <div className="container">
          <div className="block-head">
            <div>
              <div className="label-mono">Pricing</div>
              <h2>One-off audit, or always-on. Your call.</h2>
            </div>
            <p>Free scan is genuinely free, forever. Pay only if you want active probes, a public badge, or continuous monitoring on every deploy.</p>
          </div>

          <div className="pricing">
            <div className="tier">
              <div className="tier-name">Free</div>
              <div className="tier-price">$0</div>
              <p className="tier-sub">Passive scan, basic report. Good enough to know if you&apos;re actually in trouble.</p>
              <ul>
                <li>Passive HTTP &amp; DNS analysis</li>
                <li>Top 25 vulnerability checks</li>
                <li>1 URL</li>
                <li>Plain-text report (web only)</li>
                <li>No badge, no PDF, no monitoring</li>
              </ul>
              <Link href="/sign-up" className="tier-cta">Run free scan →</Link>
            </div>

            <div className="tier highlight">
              <div className="tier-name">One-off <span className="badge-best">most picked</span></div>
              <div className="tier-price">$9<span className="per">/ scan</span></div>
              <p className="tier-sub">Full active audit. The &ldquo;I&apos;m launching Tuesday and want to be sure&rdquo; tier.</p>
              <ul>
                <li>All 180 checks, active mode</li>
                <li>Shareable HTML report + PDF export</li>
                <li>&ldquo;Vibe-Checked ✓&rdquo; badge, valid 30 days</li>
                <li>Re-run for 30 days, free</li>
                <li>1 URL, one-off payment</li>
              </ul>
              <Link href="/sign-up" className="tier-cta">Buy a scan →</Link>
            </div>

            <div className="tier">
              <div className="tier-name">Monitoring</div>
              <div className="tier-price">$19<span className="per">/ month</span></div>
              <p className="tier-sub">For sites under active development. Catches regressions before users do.</p>
              <ul>
                <li>Everything in One-off</li>
                <li>Deploy-triggered re-scans (webhook)</li>
                <li>CVE alerts in Slack / email</li>
                <li>Badge stays active automatically</li>
                <li>Up to 5 URLs</li>
              </ul>
              <Link href="/sign-up" className="tier-cta">Start monitoring →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="block" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <div className="label-mono" style={{ marginBottom: 32 }}>Common questions</div>

          {[
            [
              'Is the free scan actually free?',
              'Yes, forever. No card, no trial, no catch. Free tier is passive-only — we check headers, DNS, SSL config, and public endpoint exposure. We do not probe auth flows or run active exploit checks on the free tier.',
            ],
            [
              'What counts as an "active" probe?',
              'Active scans send crafted requests to your app to test for SQL injection, XSS, auth bypasses, prompt injection, and common misconfigs. Read-only — we never write or delete data, and we always respect robots.txt. You verify ownership first so we know you consented.',
            ],
            [
              'Do I need to install anything?',
              'No. No SDK, no agent, no npm package. You give us a URL, we give you a report. The ownership verification is a single DNS TXT record or a file you drop in /public — takes about 90 seconds.',
            ],
            [
              'How does the badge work?',
              'After an active scan, we generate a cryptographically signed badge token. Embed the badge snippet in your site. It links to a stripped public report showing what we checked and what passed. The badge expires when your scan does — re-scan to renew.',
            ],
            [
              'What happens to my data?',
              'Scan results are stored in your account. We keep anonymised aggregate statistics ("X% of scanned apps have missing CSP headers"). We never share identifiable data. Delete your account at any time and everything goes — reports, findings, badge history.',
            ],
            [
              'Can I scan a staging environment?',
              'Yes — as long as it&apos;s reachable from the public internet. Private IPs and localhost are not supported. Staging scans count against your URL limit the same as production.',
            ],
          ].map(([q, a]) => (
            <div key={q} style={{ borderTop: '1px solid var(--line)', padding: '24px 0' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginBottom: 10, color: 'var(--ink)' }}>{q}</div>
              <div style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.65 }}>{a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER CTA */}
      <section style={{ background: 'var(--ink)', padding: '60px 0', textAlign: 'center' }}>
        <div className="label-mono" style={{ color: 'var(--lime)', marginBottom: 16 }}>Ready?</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Find out if your app is actually secure.</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 28, fontSize: 16 }}>Free scan. No card. Takes 60 seconds.</p>
        <Link href="/sign-up" className="btn-primary" style={{ fontSize: 16, padding: '14px 28px' }}>Run free scan →</Link>
      </section>
    </>
  )
}
