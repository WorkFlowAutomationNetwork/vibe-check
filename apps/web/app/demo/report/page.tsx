import Link from 'next/link'
import AppShell from '@/components/shared/AppShell'

export default function DemoReportPage() {
  return (
    <AppShell activeNav="reports">
      <main className="app-main">
        <Link href="/demo/dashboard" className="back-link">← back to dashboard</Link>

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

        <h2 className="section-label">Findings (15)</h2>

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
              <div className="fb-text">Your AI endpoint accepts user input that can override the system prompt.</div>
            </div>
            <div className="fb-block">
              <div className="fb-label">What we did</div>
              <div className="fb-text">Sent 40 adversarial payloads against <code>POST /api/chat</code>. <b style={{ color: 'var(--danger)' }}>6 of 40</b> succeeded.</div>
            </div>
            <div className="fb-block">
              <div className="fb-label">Recommended fix</div>
              <div className="fb-text">Move untrusted input into a separate message with structured delimiters.</div>
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
              <div className="fb-text">No CSP is set — any injected script tag on your domain runs with full privileges.</div>
            </div>
            <div className="fb-block">
              <div className="fb-label">Recommended fix</div>
              <div className="fb-text">Add a strict CSP to <code>next.config.js</code> with <code>&apos;self&apos;</code> defaults.</div>
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
              <div className="fb-text">✓ TLS 1.3 negotiated, HSTS set with <code>max-age=31536000; includeSubDomains; preload</code>.</div>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
