import type { Metadata } from 'next'
import Link from 'next/link'
import '../landing.css'

export const metadata: Metadata = {
  title: 'Pricing — Vibe-Check',
  description: 'One free passive scan a month. $15 for a full active audit. $35/mo for continuous monitoring. No BS.',
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
            <p>One free passive scan a month, no card required. Pay only if you want active probes, a public badge, or continuous monitoring on every deploy.</p>
          </div>

          <div className="pricing">
            <div className="tier">
              <div className="tier-name">Free</div>
              <div className="tier-price">$0</div>
              <p className="tier-sub">Passive scan, basic report. Good enough to know if you&apos;re actually in trouble.</p>
              <ul>
                <li>Passive HTTP header analysis</li>
                <li>Security headers &amp; TLS checks</li>
                <li>1 URL, 1 scan per month</li>
                <li>Plain-text report (web only)</li>
                <li>No badge, no PDF, no monitoring</li>
              </ul>
              <Link href="/sign-up" className="tier-cta">Run free scan →</Link>
            </div>

            <div className="tier highlight">
              <div className="tier-name">One-off <span className="badge-best">most picked</span></div>
              <div className="tier-price">$15<span className="per">/ scan</span></div>
              <p className="tier-sub">Full active audit. The &ldquo;I&apos;m launching Tuesday and want to be sure&rdquo; tier.</p>
              <ul>
                <li>Active-mode checks: backend exposure, leaked secrets, rate-limiting</li>
                <li>Shareable HTML report + PDF export</li>
                <li>&ldquo;Vibe-Checked ✓&rdquo; badge, valid 30 days</li>
                <li>1 URL, 1 successful scan included</li>
                <li>GitHub repo secret scan included (1 repo)</li>
                <li>30-day unlock — reverts to Free afterward</li>
              </ul>
              <Link href="/sign-up" className="tier-cta">Buy a scan →</Link>
            </div>

            <div className="tier">
              <div className="tier-name">Monitoring</div>
              <div className="tier-price">$35<span className="per">/ month</span></div>
              <p className="tier-sub">For sites under active development. Catches regressions before users do.</p>
              <ul>
                <li>Everything in One-off, unlimited scans</li>
                <li>GitHub integration for repo secret scanning</li>
                <li>Deploy-triggered re-scans via webhook</li>
                <li>Email alerts on completed scans</li>
                <li>Badge renewed on each re-scan</li>
                <li>Up to 5 URLs, 5 connected repos</li>
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
              'Yes — no card, no trial, no catch, just a free account (sign-up takes 30 seconds). Free gives you one passive scan a month on one URL: security headers, TLS/SSL config, and certificate health. No active probes on the free tier.',
            ],
            [
              'What counts as an "active" probe, and what\'s "deep"?',
              'Active scans (One-off and Monitor) send crafted requests to your app — checking for exposed Supabase tables/buckets, leaked secrets in JS bundles, and rate-limiting on login endpoints. Deep scans (Monitor only) add a Nuclei vulnerability-template sweep on top. Non-destructive: we never write to your database or delete anything. You verify ownership first so we know you consented.',
            ],
            [
              'Do I need to install anything?',
              'No. No SDK, no agent, no npm package. You give us a URL, we give you a report. The ownership verification is a single DNS TXT record or a file you drop in /public — takes about 90 seconds.',
            ],
            [
              'How does the badge work?',
              'After an active scan, we generate a cryptographically signed badge token. Embed the badge snippet in your site. It links to a stripped public report showing what we checked and what passed. It\'s valid for 30 days — on One-off, that also lines up with when your plan reverts to Free; re-scan (or stay on Monitor) to keep it current.',
            ],
            [
              'What happens to my data?',
              'Scan results are stored in your account. We keep anonymised aggregate statistics ("X% of scanned apps have missing CSP headers"). We never share identifiable data. Email us any time to delete your account and everything goes — reports, findings, badge history.',
            ],
            [
              'Can I scan a staging environment?',
              'Yes — as long as it&apos;s reachable from the public internet. Private IPs and localhost are not supported. Staging scans count against your URL limit the same as production.',
            ],
            [
              'What happens after my One-off 30 days are up?',
              'Your account reverts to the Free plan automatically — no charge, no action needed. Your report and findings stay in your account, but the badge stops being valid and you\'re back to Free\'s one-scan-a-month limit. Buy another One-off scan anytime to unlock active scanning again for another 30 days.',
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
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 28, fontSize: 16 }}>Free scan. No card. As little as 60 seconds.</p>
        <Link href="/sign-up" className="btn-primary" style={{ fontSize: 16, padding: '14px 28px' }}>Run free scan →</Link>
      </section>
    </>
  )
}
