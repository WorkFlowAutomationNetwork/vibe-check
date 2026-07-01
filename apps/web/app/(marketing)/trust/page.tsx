import type { Metadata } from 'next'
import Link from 'next/link'
import '../landing.css'

export const metadata: Metadata = {
  title: 'Trust & Scanner IPs — Vibe-Check',
  description:
    'How Vibe-Check scans, the IP ranges our scanner uses, and how we only ever scan ownership-verified targets.',
}

// No fixed IP list published here (2026-07-01) -- the previous list was
// placeholder AWS EU addresses that never matched the real scanner (Fly.io,
// Sydney/syd), and Fly's default egress IP isn't guaranteed stable without a
// paid static app-scoped egress IP allocation ($3.60/mo). Re-add a concrete
// list once that's provisioned -- publishing an IP that can silently drift
// would be worse than not publishing one.

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

          {/* Scanner origin */}
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
            <div className="label-mono" style={{ marginBottom: 8 }}>Where scan traffic comes from</div>
            <p style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.65 }}>
              All scan traffic originates from our scanning infrastructure in{' '}
              <strong>Sydney, Australia</strong> (Fly.io). We don&apos;t currently publish a
              fixed IP allowlist here — if your WAF or Cloudflare setup needs one, contact{' '}
              <a href="mailto:security@vibe-check-app.com" style={{ color: 'var(--violet)' }}>
                security@vibe-check-app.com
              </a>{' '}
              and we&apos;ll help you get scans through safely.
            </p>
          </div>

          {/* Safeguards */}
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            Our scanning safeguards
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 40, display: 'grid', gap: 18 }}>
            {[
              ['Ownership verification before any scan', 'Every URL must pass a DNS TXT or file-based ownership check before a single request is sent. Scans against unverified targets are refused at the job level, not just the UI.'],
              ['Non-destructive, scoped activity', 'Scans never modify or delete data on your systems. Active probes are scoped and rate-limited — some send crafted requests (e.g. login-endpoint rate-limit tests) but we never write to your database or alter application state. We store likelihood assessments and aggregate counts, never the contents of your data.'],
              ['Declared infrastructure only', 'We scan exclusively from our own Sydney, Australia infrastructure — never from a customer’s machine, a third party, or ad-hoc infrastructure. This is our commitment that scan activity is authorised, scoped, and attributable.'],
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
