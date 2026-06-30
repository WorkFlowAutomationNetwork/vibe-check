import type { Metadata } from 'next'
import Link from 'next/link'
import '../landing.css'

export const metadata: Metadata = {
  title: 'Trust & Scanner IPs — Vibe-Check',
  description:
    'How Vibe-Check scans, the IP ranges our scanner uses, and how we only ever scan ownership-verified targets.',
}

// Egress IPs of the scanner service. Keep in sync with the list shown in
// /admin/settings (Scanner IP allowlist). Single source of truth for the
// addresses customers add to their WAF / Cloudflare allowlist.
const SCANNER_IPS = [
  '52.18.41.20',
  '52.18.41.21',
  '3.122.18.5',
  '3.122.18.6',
  '18.193.0.142',
]

export default function TrustPage() {
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
            <Link href="/pricing">Pricing</Link>
            <Link href="/sign-in">Sign in</Link>
          </div>
          <div className="nav-cta">
            <Link href="/sign-up" className="btn-primary">Run free scan <span className="arr">→</span></Link>
          </div>
        </div>
      </nav>

      <section className="block" style={{ paddingTop: 80 }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="label-mono">Trust</div>
          <h2 style={{ marginBottom: 16 }}>How Vibe-Check scans, and from where.</h2>
          <p style={{ fontSize: 16, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 40 }}>
            We scan security from declared infrastructure, only against targets whose
            owners have verified control. This page lists the IP addresses our scanner
            uses and explains the safeguards around active scanning, so you can recognise
            our traffic and allowlist it.
          </p>

          {/* Scanner IPs */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius)',
              boxShadow: '6px 6px 0 var(--ink)',
              padding: '28px 32px',
              marginBottom: 40,
            }}
          >
            <div className="label-mono" style={{ marginBottom: 8 }}>Scanner egress IPs</div>
            <p style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.65, marginBottom: 16 }}>
              All scan traffic originates from these addresses. Add them to your WAF /
              Cloudflare allowlist so active scans aren&apos;t throttled or blocked. Any
              &ldquo;security&rdquo; traffic claiming to be Vibe-Check from another address
              is not us.
            </p>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                lineHeight: 2,
                background: 'var(--bg-sub)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px 18px',
              }}
            >
              {SCANNER_IPS.map(ip => <div key={ip}>{ip}</div>)}
            </div>
          </div>

          {/* Safeguards */}
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            Our scanning safeguards
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 40, display: 'grid', gap: 18 }}>
            {[
              ['Ownership verification before any scan', 'Every URL must pass a DNS TXT or file-based ownership check before a single request is sent. Scans against unverified targets are refused at the job level, not just the UI.'],
              ['Non-destructive, scoped activity', 'Scans never modify or delete data on your systems. Active probes are scoped and rate-limited — some send crafted requests (e.g. login-endpoint rate-limit tests) but we never write to your database or alter application state. We store likelihood assessments and aggregate counts, never the contents of your data.'],
              ['Declared infrastructure only', 'We scan exclusively from the IPs above. This is our commitment that scan activity is authorised, scoped, and attributable.'],
              ['You are responsible for authorisation', 'You confirm you own, or are authorised to test, every target you submit. Scanning systems you do not control may be illegal — see our Terms.'],
            ].map(([title, body]) => (
              <li key={title} style={{ borderLeft: '3px solid var(--violet)', paddingLeft: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.65 }}>{body}</div>
              </li>
            ))}
          </ul>

          <p style={{ fontSize: 14, color: 'var(--ink-mute)', lineHeight: 1.65 }}>
            Questions about scan traffic you&apos;ve seen? See our{' '}
            <Link href="/terms" style={{ color: 'var(--violet)' }}>Terms</Link> and{' '}
            <Link href="/privacy" style={{ color: 'var(--violet)' }}>Privacy Policy</Link>, or contact{' '}
            <a href="mailto:security@vibe-check-app.com" style={{ fontFamily: 'var(--font-mono)', color: 'var(--violet)' }}>security@vibe-check-app.com</a>.
          </p>
        </div>
      </section>

      <footer>
        <div className="container row">
          <div>© 2026 Vibe-Check · independently funded · made in a kitchen</div>
          <div className="links">
            <Link href="/trust">Trust</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  )
}
