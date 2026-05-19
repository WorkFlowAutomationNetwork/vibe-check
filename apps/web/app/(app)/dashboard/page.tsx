import Link from 'next/link'
import AppShell from '@/components/shared/AppShell'
import '../app.css'

export default function DashboardPage() {
  return (
    <AppShell activeNav="dashboard">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Good morning ↗</h1>
            <div className="greeting-sub">1 monitored · 1 historic · 2 new CVEs since Tue</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-soft">↻ Re-scan all</button>
            <Link href="/onboard" className="btn btn-primary">+ Add URL</Link>
          </div>
        </div>

        <div className="quick-stats">
          <div className="qstat">
            <div className="qlab">URLs monitored</div>
            <div className="qnum">1</div>
            <div className="qdelta">1 / 1 on Free plan</div>
          </div>
          <div className="qstat">
            <div className="qlab">Scans this month</div>
            <div className="qnum">0</div>
            <div className="qdelta">run your first scan</div>
          </div>
          <div className="qstat">
            <div className="qlab">Open findings</div>
            <div className="qnum">—</div>
            <div className="qdelta">scan to see findings</div>
          </div>
          <div className="qstat">
            <div className="qlab">Avg grade</div>
            <div className="qnum">—</div>
            <div className="qdelta">no scans yet</div>
          </div>
        </div>

        <h2 className="section-label">
          Your URLs <Link href="/onboard" className="see-all">+ add URL →</Link>
        </h2>

        <div className="url-cards">
          <div className="url-card">
            <div className="uc-head">
              <div>
                <div className="uc-url">
                  <span className="fav">A</span>
                  acme-app.vercel.app
                </div>
                <div className="uc-meta">production · added today · one-off scan</div>
              </div>
              <div className="grade-block">
                <div className="g">B+</div>
                <div className="label">grade</div>
              </div>
            </div>
            <div className="uc-body">
              <div className="badges-row">
                <span className="chip ok"><span className="dot" /> badge active</span>
                <span className="chip">last scanned 3d ago</span>
                <span className="chip violet">180/180 checks</span>
              </div>
              <div className="sev">
                <div className="seg crit" style={{ flex: 1 }} />
                <div className="seg med" style={{ flex: 3 }} />
                <div className="seg pass" style={{ flex: 11 }} />
              </div>
              <div className="sev-legend">
                <span className="c"><b>1</b> critical</span>
                <span className="m"><b>3</b> medium</span>
                <span className="p"><b>11</b> passed</span>
              </div>
            </div>
            <div className="uc-foot">
              <div className="lefty">badge expires <b>Jun 15</b> · re-scan free for 27d</div>
              <div className="righty">
                <Link href="/report/demo" className="btn-mini ghost">View report</Link>
                <button className="btn-mini">↻ Re-scan</button>
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px dashed var(--line-strong)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '40px 24px',
            minHeight: 200,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--line-strong)' }}>+</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>Add another URL</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', maxWidth: '28ch' }}>
              Upgrade to Monitor to track multiple URLs.
            </div>
            <Link href="/onboard" className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>+ Add URL</Link>
          </div>
        </div>

        <h2 className="section-label">
          Recent activity <Link href="#" className="see-all">full log →</Link>
        </h2>
        <div className="activity">
          <div className="activity-item cve">
            <div className="ts">2026-05-19 09:14</div>
            <div className="glyph">!</div>
            <div className="body">
              <b>New CVE matched</b> · <code>next@14.2.4</code> on <b>acme-app.vercel.app</b>
              <small>CVE-2026-1402 · moderate · upgrade to 14.2.6 to patch</small>
            </div>
            <div className="more"><Link href="/report/demo">review →</Link></div>
          </div>
          <div className="activity-item rescan">
            <div className="ts">2026-05-16 02:11</div>
            <div className="glyph">↻</div>
            <div className="body">
              <b>Re-scan completed</b> · <code>acme-app.vercel.app</code>
              <small>180 checks · grade improved B → B+ · 2 issues resolved</small>
            </div>
            <div className="more"><Link href="/report/demo">view diff →</Link></div>
          </div>
          <div className="activity-item badge">
            <div className="ts">2026-05-16 02:11</div>
            <div className="glyph">✓</div>
            <div className="body">
              <b>Badge renewed</b> for <code>acme-app.vercel.app</code>
              <small>valid through Jun 15 · public report link refreshed</small>
            </div>
            <div className="more"><a href="#">copy link →</a></div>
          </div>
          <div className="activity-item fix">
            <div className="ts">2026-05-15 18:42</div>
            <div className="glyph">✎</div>
            <div className="body">
              <b>Fix applied</b> · CSP header added to <code>acme-app.vercel.app</code>
              <small>finding closed by deploy from <b>main@a4f31c2</b> · auto-verified on re-scan</small>
            </div>
            <div className="more"><span>—</span></div>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
