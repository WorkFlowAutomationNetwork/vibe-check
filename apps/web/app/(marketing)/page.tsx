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
          <p className="sub">Shipped something with Claude, Cursor, or v0 at 2am? We probe the things you probably forgot about. Free scan in 60 seconds, no account.</p>

          <div className="scan" id="hero-scan">
            <div className="prefix"><span>https://</span></div>
            <input type="text" placeholder="my-cool-side-project.vercel.app" autoComplete="off" spellCheck={false} />
            <Link href="/sign-up" className="scan-btn">Scan now <span>→</span></Link>
          </div>
          <div className="scan-note">
            <span>◯ Free scan takes ~60 seconds</span>
            <span>◯ No account, no card, no Slack DM</span>
            <span>◯ Read-only · we don&apos;t touch your data</span>
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
            <div className="pill"><span className="pillIcon">~</span> takes <b>60s</b> end-to-end</div>
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
            <p>Six categories, ~180 individual probes. Most apps fail at least four of them on the first scan. That&apos;s fine — we tell you exactly which ones, in plain English, with fix priority.</p>
          </div>

          <div className="check-grid">
            <div className="check-card">
              <div className="ico">SSL</div>
              <h3>SSL &amp; security headers</h3>
              <p>HSTS, CSP, X-Frame-Options, the alphabet soup that decides whether a stranger can iframe your login screen.</p>
              <div className="more"><span>strict-transport-security</span><span>content-security-policy</span></div>
            </div>
            <div className="check-card">
              <div className="ico">⚿</div>
              <h3>Auth &amp; access control</h3>
              <p>Are your /admin routes actually protected, or just hidden? We try to walk in. You&apos;d be shocked how often it works.</p>
              <div className="more"><span>route guards</span><span>IDOR</span><span>cookies</span></div>
            </div>
            <div className="check-card ai">
              <div className="ico">AI</div>
              <span className="tag">For AI apps</span>
              <h3>Prompt injection</h3>
              <p>Your system prompt is currently one clever DM away from leaking. We try ~40 known jailbreaks against your wrapper.</p>
              <div className="more"><span>system prompt leak</span><span>tool abuse</span></div>
            </div>
            <div className="check-card">
              <div className="ico">/&gt;</div>
              <h3>Exposed endpoints</h3>
              <p>That debug route you left on. The unauthenticated /api/users. The .env in /public. We find them so attackers don&apos;t.</p>
              <div className="more"><span>/api/*</span><span>/.well-known</span><span>/_next</span></div>
            </div>
            <div className="check-card">
              <div className="ico">{"{ }"}</div>
              <h3>Dependency CVEs</h3>
              <p>That npm package Cursor installed three weeks ago has a CVE now. We cross-check your bundle against the live CVE feed.</p>
              <div className="more"><span>npm</span><span>pypi</span><span>cargo</span></div>
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
              <p>180 checks across six categories. Active mode tries known exploits on your routes — read-only, never destructive.</p>
              <div className="demo">
                <div className="row"><b>tls/hsts</b><span className="ok">PASS</span></div>
                <div className="row"><b>csp policy</b><span className="bad">FAIL</span></div>
                <div className="row"><b>auth bypass</b><span className="bad">FAIL</span></div>
                <div className="row"><b>cve scan</b><span className="ok">PASS</span></div>
                <div className="row"><b>prompt inject</b><span className="pending">running…</span></div>
              </div>
            </div>
            <div className="step">
              <div className="num">STEP 03 <span className="dotline" /></div>
              <h3>Get a prioritized fix list.</h3>
              <p>Each issue is rated by severity and reachability. We tell you what to fix first and copy-paste the exact code or config.</p>
              <div className="demo">
                <div className="row"><span style={{ color: 'var(--danger)', fontWeight: 700 }}>P0</span><span><b>Public admin route</b></span></div>
                <div className="row"><span style={{ color: '#D88934', fontWeight: 700 }}>P1</span><span><b>Missing CSP header</b></span></div>
                <div className="row"><span style={{ color: '#D88934', fontWeight: 700 }}>P1</span><span><b>Outdated next-auth</b></span></div>
                <div className="row"><span style={{ color: 'var(--ink-mute)', fontWeight: 700 }}>P2</span><span><b>X-Frame missing</b></span></div>
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
              <p className="tier-sub">Full active audit. The &#34;I&apos;m launching Tuesday and want to be sure&#34; tier.</p>
              <ul>
                <li>All 180 checks, active mode</li>
                <li>Shareable HTML report + PDF export</li>
                <li>&#34;Vibe-Checked ✓&#34; badge, valid 30 days</li>
                <li>Re-run for 30 days, free</li>
                <li>1 URL, expires after scan</li>
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
                  <span className="v-meta" style={{ color: '#9a9a93' }}>A · 180/180</span>
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginTop: 6 }}>
                drop-in snippet:
              </div>
              <pre className="snippet-pre">{`<script src="https://vibe-check.dev/b.js" data-id="vc_8f3a"></script>`}</pre>
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
          <h2>Ship with confidence.<br />Takes 60 seconds.</h2>
          <p>You&apos;ve already shipped. We&apos;re just asking if you&apos;d like to know what&apos;s underneath.</p>
          <div className="scan" style={{ margin: '0 auto' }}>
            <div className="prefix"><span>https://</span></div>
            <input type="text" placeholder="my-cool-side-project.vercel.app" autoComplete="off" spellCheck={false} />
            <Link href="/sign-up" className="scan-btn">Scan now <span>→</span></Link>
          </div>
          <div className="scan-note" style={{ justifyContent: 'center' }}>
            <span>◯ Free scan</span>
            <span>◯ No account</span>
            <span>◯ 60 seconds</span>
          </div>
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
