import type { Metadata } from 'next'
import Link from 'next/link'
import { getLandingStats } from '@/lib/stats'
import './landing.css'

export const metadata: Metadata = {
  title: 'Vibe Check — Security audit for vibe-coded apps',
}

// Refresh the live stats at most once per hour (ISR).
export const revalidate = 3600

export default async function LandingPage() {
  const stats = await getLandingStats()

  // Hard-error fallback only: if the stats RPC is unreachable, show the original
  // copy so SSR/layout never breaks. The normal path shows real numbers.
  const scansRun = stats ? stats.scansRun.toLocaleString('en-US') : '2,431'
  const sitesChecked = stats ? stats.sitesChecked.toLocaleString('en-US') : '2,431'
  const avgVulns = stats ? stats.avgVulns.toFixed(1) : '6.2'
  const repoScansRun = stats ? stats.repoScansRun.toLocaleString('en-US') : '0'
  const secretsFound = stats ? stats.secretsFound.toLocaleString('en-US') : '0'

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="logo">
            <div className="logo-mark">✓<span className="pulse" /></div>
            <span>Vibe-Check</span>
          </Link>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <Link href="/sign-in">Sign in</Link>
          </div>
          <div className="nav-cta">
            <Link href="/sign-up" className="btn-primary">Run free scan <span className="arr">→</span></Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="container">
          <div className="hero-eyebrow"><span className="dot" /> Scanning live · {sitesChecked} sites checked</div>
          <h1>Your app passed the <span className="strike">vibe check</span>.<br />But did it pass a <span className="accent">security check</span>?</h1>
          <p className="sub">Shipped something with Claude, Cursor, or v0 at 2am? We probe the things you probably forgot about. Verify ownership once, get a graded report in as little as 60 seconds.</p>

          <div className="scan" id="hero-scan">
            <div className="prefix"><span>https://</span></div>
            <input type="text" placeholder="my-cool-side-project.vercel.app" autoComplete="off" spellCheck={false} />
            <Link href="/sign-up" className="scan-btn">Scan now <span>→</span></Link>
          </div>
          <div className="scan-note">
            <span>◯ Free scan ~60 s · active 2–3 min · deep up to 7 min</span>
            <span>◯ Ownership verified once, then you&apos;re done</span>
            <span>◯ Non-destructive · we never modify your data</span>
          </div>
        </div>

        <div className="hero-side-tag">
          <div><span className="arrow">↘</span> built for the<br />&#34;ship first, ask later&#34;<br />generation</div>
        </div>
      </section>

      {/* TRUST */}
      <section className="trust">
        <div className="container">
          <p className="trust-line">Built for the generation that <em>ships first</em> and asks questions later.</p>
          <div className="pills">
            <div className="pill"><span className="pillIcon">↑</span><b>{scansRun}</b> scans run</div>
            <div className="pill"><span className="pillIcon">!</span> avg <b>{avgVulns}</b> vulnerabilities found</div>
            <div className="pill"><span className="pillIcon">⎇</span><b>{repoScansRun}</b> repo scans run</div>
            <div className="pill"><span className="pillIcon">🔑</span><b>{secretsFound}</b> secrets caught</div>
            <div className="pill"><span className="pillIcon">~</span> free scan in <b>~60s</b></div>
            <div className="pill"><span className="pillIcon">$</span> from <b>$0</b>, no card needed</div>
          </div>
          <div className="marquee-wrap">
            <div className="marquee">
              <span>vercel deploys</span><span>next.js apps</span><span>supabase backends</span><span>stripe checkouts</span><span>clerk auth</span><span>railway services</span><span>openai wrappers</span><span>anthropic agents</span><span>fly.io edges</span><span>cloudflare workers</span>
              <span>vercel deploys</span><span>next.js apps</span><span>supabase backends</span><span>stripe checkouts</span><span>clerk auth</span><span>railway services</span><span>openai wrappers</span><span>anthropic agents</span><span>fly.io edges</span><span>cloudflare workers</span>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT WE CHECK */}
      <section className="block" id="checks">
        <div className="container">
          <div className="block-head">
            <div>
              <div className="label-mono">What we check</div>
              <h2>The boring stuff your AI didn&apos;t think about.</h2>
            </div>
            <p>50+ checks across 8 modules — and more added regularly. Most apps fail at least four on the first scan. That&apos;s fine — we tell you exactly which ones, in plain English, with fix priority.</p>
          </div>

          <div className="check-grid">
            <div className="check-card">
              <div className="ico">SSL</div>
              <h3>SSL &amp; security headers</h3>
              <p>HSTS, CSP, X-Frame-Options, the alphabet soup that decides whether a stranger can iframe your login screen.</p>
              <div className="more"><span>strict-transport-security</span><span>content-security-policy</span></div>
            </div>
            <div className="check-card">
              <div className="ico">TLS</div>
              <h3>TLS &amp; certificate health</h3>
              <p>Expired certs, weak cipher suites, outdated protocol versions. We run sslyze so you don&apos;t find out from your users.</p>
              <div className="more"><span>cert expiry</span><span>cipher suites</span><span>protocol versions</span></div>
            </div>
            <div className="check-card">
              <div className="ico">⎇</div>
              <h3>Git secret scanning</h3>
              <p>API keys, tokens, and passwords committed to your repo history — then forgotten. We scan every commit, not just HEAD.</p>
              <div className="more"><span>full history</span><span>stripe keys</span><span>aws credentials</span></div>
            </div>
            <div className="check-card">
              <div className="ico">/&gt;</div>
              <h3>Exposed endpoints</h3>
              <p>That debug route you left on. The unauthenticated /api/users. The .env in /public. We find them so attackers don&apos;t.</p>
              <div className="more"><span>/api/*</span><span>/.well-known</span><span>/_next</span></div>
            </div>
            <div className="check-card">
              <div className="ico">⏱</div>
              <h3>Rate limiting</h3>
              <p>Login endpoints, reset flows, and public APIs. We probe to see if an attacker could hammer them without getting blocked.</p>
              <div className="more"><span>login brute-force</span><span>reset abuse</span><span>api throttling</span></div>
            </div>
            <div className="check-card">
              <div className="ico">⚙</div>
              <h3>Misconfigurations</h3>
              <p>Public S3 buckets. CORS set to <code>*</code>. Stripe test keys in production. The usual suspects, automated.</p>
              <div className="more"><span>cors</span><span>secrets</span><span>cloud</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="block" id="how" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="block-head">
            <div>
              <div className="label-mono">How it works</div>
              <h2>Three steps. No setup. No SDK to install.</h2>
            </div>
            <p>You give us a URL. We do the rest. If you can paste a link, you can run a security audit.</p>
          </div>

          <div className="steps">
            <div className="step">
              <div className="num">STEP 01 <span className="dotline" /></div>
              <h3>Paste your URL.</h3>
              <p>Verify ownership with a single DNS TXT record or a meta tag. Takes about 90 seconds, only required for active scans.</p>
              <div className="demo">
                <div className="input-mock">
                  <span style={{ color: 'var(--ink-mute)' }}>https://</span>
                  <span style={{ color: 'var(--ink)' }}>my-app.com</span>
                  <span className="blink" />
                </div>
                <div className="row" style={{ marginTop: 10 }}><span>domain verified</span><span className="ok">✓ OK</span></div>
              </div>
            </div>
            <div className="step">
              <div className="num">STEP 02 <span className="dotline" /></div>
              <h3>We probe, test, simulate.</h3>
              <p>50+ checks across 8 modules. Active mode probes your real endpoints — non-destructive, we never modify your data.</p>
              <div className="demo">
                <div className="row"><b>tls/hsts</b><span className="ok">PASS</span></div>
                <div className="row"><b>csp policy</b><span className="bad">FAIL</span></div>
                <div className="row"><b>rate limiting</b><span className="bad">FAIL</span></div>
                <div className="row"><b>secrets scan</b><span className="ok">PASS</span></div>
                <div className="row"><b>nuclei templates</b><span className="pending">running…</span></div>
              </div>
            </div>
            <div className="step">
              <div className="num">STEP 03 <span className="dotline" /></div>
              <h3>Get a prioritized fix list.</h3>
              <p>Each issue is rated by severity and reachability. We tell you what to fix first and copy-paste the exact code or config.</p>
              <div className="demo">
                <div className="row"><span style={{ color: 'var(--danger)', fontWeight: 700 }}>P0</span><span><b>Supabase table exposed</b></span></div>
                <div className="row"><span style={{ color: '#D88934', fontWeight: 700 }}>P1</span><span><b>Missing CSP header</b></span></div>
                <div className="row"><span style={{ color: '#D88934', fontWeight: 700 }}>P1</span><span><b>No rate limiting on login</b></span></div>
                <div className="row"><span style={{ color: 'var(--ink-mute)', fontWeight: 700 }}>P2</span><span><b>X-Frame-Options missing</b></span></div>
                <div className="row"><span style={{ color: 'var(--ink-mute)', fontWeight: 700 }}>P3</span><span><b>Server header leaks</b></span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="block" id="pricing" style={{ paddingTop: 0 }}>
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
                <li>Passive HTTP &amp; DNS analysis</li>
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
              <p className="tier-sub">Full active audit. The &#34;I&apos;m launching Tuesday and want to be sure&#34; tier.</p>
              <ul>
                <li>Active-mode checks: backend exposure, leaked secrets, rate-limiting</li>
                <li>Shareable HTML report + PDF export</li>
                <li>&#34;Vibe-Checked ✓&#34; badge, valid 30 days</li>
                <li>1 URL, 1 successful scan included</li>
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
                <li>Full GitHub + Vercel integration</li>
                <li>Deploy-triggered re-scans (webhook)</li>
                <li>Email alerts on new findings</li>
                <li>Badge renewed on each re-scan</li>
                <li>Up to 5 URLs, 5 connected repos</li>
              </ul>
              <Link href="/sign-up" className="tier-cta">Start monitoring →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* BADGE PREVIEW */}
      <section className="badge-section">
        <div className="container">
          <div className="badge-grid">
            <div className="copy">
              <div className="label-mono">The badge</div>
              <h2>Show your users you actually checked.</h2>
              <p>A real, verifiable badge for your landing page. Clicks through to a public report (the friendly version — fixed issues only, no juicy attack surface).</p>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <span className="vibe-badge">
                  <span className="badge-mark">✓</span>
                  <span>Vibe-Checked</span>
                  <span className="v-meta">v1 · jun 2026</span>
                </span>
                <span className="vibe-badge" style={{ background: 'var(--ink)', color: 'white' }}>
                  <span className="badge-mark" style={{ background: 'var(--lime)', color: 'var(--ink)' }}>✓</span>
                  <span style={{ color: 'white' }}>Vibe-Checked</span>
                  <span className="v-meta" style={{ color: '#9a9a93' }}>Grade A · 2026</span>
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginTop: 6 }}>
                drop-in snippet:
              </div>
              <pre className="snippet-pre">{`<a href="https://vibe-check-app.com/report/…/public">\n  <img src="https://vibe-check-app.com/api/badge/…/image"\n       alt="Vibe-Checked" height="20" />\n</a>`}</pre>
            </div>

            <div className="mock-site">
              <div className="mock-bar">
                <div className="lights"><span /><span /><span /></div>
                <div className="url">https://acme-app.com</div>
              </div>
              <div className="mock-body">
                <div className="mock-nav">
                  <div className="brand">▲ acme</div>
                  <div className="links"><span>Product</span><span>Docs</span><span>Pricing</span><span>Sign up</span></div>
                </div>
                <div className="mock-content">
                  <h4>The fastest way to ship what&apos;s in your head.</h4>
                  <p>Drag, drop, deploy. We handle the rest — backend, scaling, auth, all the wires you don&apos;t want to think about.</p>
                  <div className="mock-actions">
                    <span className="ba">Get started →</span>
                    <span className="bb">See demo</span>
                  </div>
                </div>
                <span className="vibe-badge badge-on-site">
                  <span className="badge-mark">✓</span>
                  <span>Vibe-Checked</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="cta-final" id="cta">
        <div className="container">
          <div className="label-mono" style={{ justifyContent: 'center', display: 'inline-flex' }}>▼ Last thing</div>
          <h2>Ship with confidence.<br />As little as 60 seconds.</h2>
          <p>You&apos;ve already shipped. We&apos;re just asking if you&apos;d like to know what&apos;s underneath.</p>
          <div className="scan" style={{ margin: '0 auto' }}>
            <div className="prefix"><span>https://</span></div>
            <input type="text" placeholder="my-cool-side-project.vercel.app" autoComplete="off" spellCheck={false} />
            <Link href="/sign-up" className="scan-btn">Scan now <span>→</span></Link>
          </div>
          <div className="scan-note" style={{ justifyContent: 'center' }}>
            <span>◯ Free scan</span>
            <span>◯ Verify once, scan anytime</span>
            <span>◯ as little as 60 s</span>
          </div>
        </div>
      </section>

      <footer>
        <div className="container row">
          <div>© 2026 Vibe-Check · independently funded · made in a kitchen</div>
          <div className="links">
            <Link href="/trust">Trust</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/terms#refund">Refund policy</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/pricing">Pricing</Link>
          </div>
        </div>
      </footer>
    </>
  )
}
