import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import ReportActionsBar from '@/components/report/ReportActionsBar'
import '../../app.css'

interface Props {
  params: { scanId: string }
}

export default function ReportPage({ params }: Props) {
  if (!params.scanId) notFound()

  return (
    <AppShell activeNav="reports">
      <main className="app-main">
        <Link href="/dashboard" className="back-link">← back to dashboard</Link>

        <div className="report-top">
          <div>
            <h1 className="report-title">
              <span className="prefix">https://</span>acme-app.vercel.app
            </h1>
            <div className="report-meta">
              <span>scan id <b>vc_8f3a91e2</b></span>
              <span>completed <b>May 16, 2026 · 02:11 UTC</b></span>
              <span>duration <b>00:58.4</b></span>
              <span>mode <b>active</b></span>
            </div>
          </div>
          <ReportActionsBar scanId={params.scanId} />
        </div>

        <div className="grade-card">
          <div className="grade-big">
            <div className="gnum">B+</div>
            <div className="gnote">A grade away from a clean public badge</div>
          </div>
          <div className="grade-body">
            <p className="verdict">You&apos;re not on fire. Yet.</p>
            <p className="verdict-sub">One critical issue worth fixing today, three medium issues for the week. The rest is genuinely solid — better than ~70% of apps we scan.</p>
          </div>
          <div className="grade-summary">
            <div className="gs-row crit"><div className="swatch" /><div className="n">1</div> critical · fix today</div>
            <div className="gs-row med"><div className="swatch" /><div className="n">3</div> medium · this week</div>
            <div className="gs-row pass"><div className="swatch" /><div className="n">11</div> passed clean</div>
          </div>
        </div>

        <h2 className="section-label">Findings (15) <span className="see-all">expand all →</span></h2>

        <div className="finding crit expanded">
          <div className="finding-head">
            <div className="left-strip" />
            <span className="severity-tag crit">Critical</span>
            <div className="ftitle">Prompt injection bypass <code>/api/chat</code></div>
            <div className="frt">first seen now · category: ai</div>
          </div>
          <div className="finding-body">
            <div className="fb-block">
              <div className="fb-label">What it is</div>
              <div className="fb-text">Your AI endpoint accepts user input that can override the system prompt — leaking instructions or invoking tools the user shouldn&apos;t have access to.</div>
            </div>
            <div className="fb-block">
              <div className="fb-label">What we did</div>
              <div className="fb-text">Sent 40 adversarial payloads against <code>POST /api/chat</code>. <b style={{ color: 'var(--danger)' }}>6 of 40</b> succeeded in overriding system instructions or extracting the prompt.</div>
            </div>
            <div className="fb-block">
              <div className="fb-label">Recommended fix</div>
              <div className="fb-text">
                Move untrusted input into a separate message with structured delimiters, and add a server-side guard prompt that rejects instruction-override attempts before tool calls.
                <div className="finding-cta">
                  <a href="#" className="btn btn-primary" style={{ padding: '8px 12px', fontSize: 13 }}>Read fix guide →</a>
                  <a href="#" className="btn btn-soft" style={{ padding: '8px 12px', fontSize: 13 }}>See the 6 payloads</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="finding med expanded">
          <div className="finding-head">
            <div className="left-strip" />
            <span className="severity-tag med">Medium</span>
            <div className="ftitle">Missing Content-Security-Policy header</div>
            <div className="frt">first seen 11d ago · category: headers</div>
          </div>
          <div className="finding-body">
            <div className="fb-block">
              <div className="fb-label">What it is</div>
              <div className="fb-text">No CSP is set, so any injected script tag on your domain runs with full privileges. Increases blast radius of any XSS bug from &quot;annoying&quot; to &quot;account takeover&quot;.</div>
            </div>
            <div className="fb-block">
              <div className="fb-label">What we did</div>
              <div className="fb-text">Read response headers for <code>GET /</code> and three sub-routes. Found <code>Strict-Transport-Security</code> ✓, but <code>Content-Security-Policy</code> ✗.</div>
            </div>
            <div className="fb-block">
              <div className="fb-label">Recommended fix</div>
              <div className="fb-text">
                Add a strict CSP to <code>next.config.js</code> with <code>&apos;self&apos;</code> defaults.
                <div className="finding-cta">
                  <a href="#" className="btn btn-primary" style={{ padding: '8px 12px', fontSize: 13 }}>Read fix guide →</a>
                  <a href="#" className="btn btn-soft" style={{ padding: '8px 12px', fontSize: 13 }}>Copy starter CSP</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="finding pass expanded">
          <div className="finding-head">
            <div className="left-strip" />
            <span className="severity-tag pass">Passed</span>
            <div className="ftitle">TLS / HSTS — transport layer secure</div>
            <div className="frt">stable across 14 scans · category: transport</div>
          </div>
          <div className="finding-body" style={{ gridTemplateColumns: '1fr' }}>
            <div className="fb-block">
              <div className="fb-text">✓ TLS 1.3 negotiated, HSTS set with <code>max-age=31536000; includeSubDomains; preload</code>. Certificate valid through Aug 21, 2026 — Let&apos;s Encrypt R3. Nothing to fix here.</div>
            </div>
          </div>
        </div>

        <div className="finding med">
          <div className="finding-head">
            <div className="left-strip" />
            <span className="severity-tag med">Medium</span>
            <div className="ftitle">Outdated dependency <code>next-auth@4.24.1</code></div>
            <div className="frt">expand · 1 CVE matched</div>
          </div>
        </div>
        <div className="finding med">
          <div className="finding-head">
            <div className="left-strip" />
            <span className="severity-tag med">Medium</span>
            <div className="ftitle"><code>X-Frame-Options</code> not set on auth routes</div>
            <div className="frt">expand · clickjacking surface</div>
          </div>
        </div>
        <div className="finding pass">
          <div className="finding-head">
            <div className="left-strip" />
            <span className="severity-tag pass">Passed</span>
            <div className="ftitle">No public S3 buckets or exposed env files</div>
            <div className="frt">expand · 12 paths probed</div>
          </div>
        </div>

        <h2 className="section-label" style={{ marginTop: 48 }}>Checks run (180 · showing 8) <a href="#" className="see-all">full list →</a></h2>
        <div className="checks-table">
          <div className="ct-head">
            <div>Check</div><div>Method</div><div>Severity</div><div>Result</div><div>Time</div>
          </div>
          <div className="ct-row">
            <div className="nm">tls.hsts</div>
            <div className="meth">HEAD / → header inspect</div>
            <div className="sev">low</div>
            <div className="res pass">PASS</div>
            <div className="ms">241 ms</div>
          </div>
          <div className="ct-row">
            <div className="nm">headers.csp</div>
            <div className="meth">GET /, /login → policy parse</div>
            <div className="sev s-m">medium</div>
            <div className="res fail">FAIL</div>
            <div className="ms">412 ms</div>
          </div>
          <div className="ct-row">
            <div className="nm">auth.admin_route_walk</div>
            <div className="meth">probe /admin, /api/admin/*</div>
            <div className="sev s-m">medium</div>
            <div className="res warn">WARN</div>
            <div className="ms">1,482 ms</div>
          </div>
          <div className="ct-row">
            <div className="nm">cors.policy</div>
            <div className="meth">OPTIONS /api/* · 14 routes</div>
            <div className="sev">low</div>
            <div className="res pass">PASS</div>
            <div className="ms">324 ms</div>
          </div>
          <div className="ct-row">
            <div className="nm">deps.cve_match</div>
            <div className="meth">parse build manifest · 47 deps</div>
            <div className="sev s-m">medium</div>
            <div className="res warn">3 HITS</div>
            <div className="ms">983 ms</div>
          </div>
          <div className="ct-row">
            <div className="nm">ai.prompt_injection</div>
            <div className="meth">POST /api/chat · 40 payloads</div>
            <div className="sev s-c">critical</div>
            <div className="res fail">FAIL</div>
            <div className="ms">1,821 ms</div>
          </div>
          <div className="ct-row">
            <div className="nm">endpoints.exposed_files</div>
            <div className="meth">walk /_next, /.well-known, /api</div>
            <div className="sev">low</div>
            <div className="res pass">PASS</div>
            <div className="ms">764 ms</div>
          </div>
          <div className="ct-row">
            <div className="nm">secrets.bucket_grep</div>
            <div className="meth">public S3 + env file probe</div>
            <div className="sev">low</div>
            <div className="res pass">PASS</div>
            <div className="ms">538 ms</div>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
