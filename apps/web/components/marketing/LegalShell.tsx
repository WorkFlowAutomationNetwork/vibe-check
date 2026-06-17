import Link from 'next/link'

/**
 * Shared chrome for the /terms and /privacy pages: marketing nav, a prominent
 * DRAFT / lawyer-review banner, a titled content column, and the legal footer.
 *
 * These documents are drafts to be reviewed by a qualified lawyer before the
 * product takes paying customers. Business-specific values are marked inline
 * with [BRACKETED PLACEHOLDERS].
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
          <div
            style={{
              background: 'var(--warn)',
              color: 'var(--ink)',
              border: '1.5px solid var(--ink)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5,
              marginBottom: 32,
            }}
          >
            ⚠ DRAFT — TEMPLATE ONLY. This document has not been reviewed by a lawyer
            and is not legal advice. It must be reviewed and adapted by qualified
            counsel, and all [BRACKETED] placeholders filled in, before it is relied
            upon or shown to customers.
          </div>

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
