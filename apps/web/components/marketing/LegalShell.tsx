import Link from 'next/link'

/**
 * Shared chrome for the /terms and /privacy pages: marketing nav, a titled
 * content column, and the legal footer.
 */
export default function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
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

      <section className="block" style={{ paddingTop: 64 }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="label-mono">Legal</div>
          <h2 style={{ marginBottom: 8 }}>{title}</h2>
          <div className="label-mono" style={{ color: 'var(--ink-mute)', marginBottom: 32 }}>
            Last updated: {lastUpdated}
          </div>

          <div className="legal-body">{children}</div>
        </div>
      </section>

      <footer>
        <div className="container row">
          <div>© 2026 Vibe-Check · independently funded · made in a kitchen</div>
          <div className="links">
            <Link href="/trust">Trust</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/pricing">Pricing</Link>
          </div>
        </div>
      </footer>
    </>
  )
}
