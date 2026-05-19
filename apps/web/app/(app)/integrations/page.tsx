import AppShell from '@/components/shared/AppShell'
import '../app.css'

export default function IntegrationsPage() {
  return (
    <AppShell activeNav="integrations">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Integrations</h1>
            <div className="greeting-sub">connect your stack · deploy hooks · alert routing</div>
          </div>
        </div>

        <h2 className="section-label">Connected services</h2>
        <div className="int-grid">

          <div className="int-card">
            <div className="int-head">
              <div className="int-mark gh">○</div>
              <div className="int-title-wrap">
                <div className="int-name">GitHub <span className="chip ok"><span className="dot" /> Connected</span></div>
                <p className="int-desc">Read your dependency manifests for accurate CVE matching and committed-secret detection.</p>
              </div>
            </div>
            <div className="int-body">
              <div className="int-detail">
                <div className="lbl">account</div>
                <div className="val"><code>github.com/your-handle</code> · connected today</div>
              </div>
              <div className="int-detail">
                <div className="lbl">access</div>
                <div className="val">
                  <code>contents:read</code> on 2 repos
                  <div className="repo-list"><span>acme-app</span><span>acme-api</span></div>
                </div>
              </div>
              <div className="int-detail">
                <div className="lbl">enables</div>
                <div className="val">Accurate CVE scanning across 47 direct deps. Secret detection in committed code.</div>
              </div>
            </div>
            <div className="int-actions">
              <button className="btn btn-soft" style={{ padding: '8px 12px', fontSize: 13 }}>Manage access</button>
              <button className="btn btn-soft" style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>Disconnect</button>
            </div>
            <div className="int-note">We read <code>package.json</code> and lock files only. Code is never stored. Revoke any time from GitHub → Settings → Applications.</div>
          </div>

          <div className="int-card">
            <div className="int-head">
              <div className="int-mark vercel">▲</div>
              <div className="int-title-wrap">
                <div className="int-name">Vercel <span className="chip ok"><span className="dot" /> Active</span></div>
                <p className="int-desc">Webhook-based deploy triggers. No OAuth — you don&apos;t grant account access.</p>
              </div>
            </div>
            <div className="int-body">
              <div className="int-detail">
                <div className="lbl">webhook</div>
                <div className="val">active on 1 project · <code>acme-app</code></div>
              </div>
              <div className="int-detail">
                <div className="lbl">last fired</div>
                <div className="val">May 16, 02:09 UTC → scan started 8s later</div>
              </div>
              <div>
                <div className="int-webhook">
                  <span className="val">https://app.vibe-check.dev/hooks/deploy/vc_8f3a91e2</span>
                  <button>copy</button>
                </div>
                <a href="#" className="int-doc-link">How to add in Vercel →</a>
              </div>
            </div>
            <div className="int-actions">
              <button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: 13 }}>+ Add another project</button>
            </div>
            <div className="int-note">No OAuth, no account access — just a URL pasted into Vercel&apos;s deploy notifications. Rotate any time.</div>
          </div>

          <div className="int-card disconnected">
            <div className="int-head">
              <div className="int-mark netlify">◆</div>
              <div className="int-title-wrap">
                <div className="int-name">Netlify <span className="chip"><span className="dot" style={{ background: 'var(--ink-mute)' }} /> Not connected</span></div>
                <p className="int-desc">Deploy-triggered re-scans when you push to production.</p>
              </div>
            </div>
            <div className="int-body">
              <div className="int-detail">
                <div className="lbl">how it works</div>
                <div className="val">Paste a unique webhook URL into your Netlify site&apos;s deploy notifications. We trigger a scan ~10s after each successful production deploy.</div>
              </div>
            </div>
            <div className="int-actions">
              <button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: 13 }}>Connect Netlify</button>
            </div>
            <div className="int-note">Webhook-based. No account access. Same model as Vercel — works with self-hosted Netlify too.</div>
          </div>

          <div className="int-card disconnected">
            <div className="int-head">
              <div className="int-mark slack">⊞</div>
              <div className="int-title-wrap">
                <div className="int-name">Slack <span className="chip"><span className="dot" style={{ background: 'var(--ink-mute)' }} /> Not connected</span></div>
                <p className="int-desc">Alerts when something needs your attention.</p>
              </div>
            </div>
            <div className="int-body">
              <div className="int-detail">
                <div className="lbl">sends</div>
                <div className="val">New CVE matches · Scan completions (optional) · Badge expiry warnings.</div>
              </div>
            </div>
            <div className="int-actions">
              <button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: 13, background: 'var(--violet)' }}>+ Add to Slack</button>
            </div>
            <div className="int-note">Alerts go to a channel of your choice. We never read messages — write-only scope, requested at install.</div>
          </div>
        </div>

        <h2 className="section-label">API access</h2>
        <div className="api-block">
          <p>Programmatic access to scans and reports. Use this key in CI to gate deploys on grade thresholds.</p>
          <div className="api-key">
            <span className="key-val">vc_live_sk_8f3a••••••••••••••••</span>
            <div className="key-actions">
              <button>Reveal</button>
              <button>Rotate key</button>
            </div>
          </div>
          <a href="#" className="int-doc-link" style={{ fontSize: 13 }}>Read the API docs →</a>
          <div className="api-warning"><b>Heads up:</b> this key can trigger scans and read reports. Treat it like a password.</div>
        </div>

        <h2 className="section-label">Recent deploy hooks (last 5) <a href="#" className="see-all">full log →</a></h2>
        <div className="hook-log">
          <div className="hook-row head">
            <div>timestamp</div>
            <div>source</div>
            <div>project</div>
            <div>action</div>
            <div>status</div>
          </div>
          <div className="hook-row">
            <div className="ts">2026-05-19 09:14:02</div>
            <div className="src">Vercel</div>
            <div className="proj">acme-app · main</div>
            <div className="act">prod deploy · scan queued</div>
            <div className="st">SCAN QUEUED</div>
          </div>
          <div className="hook-row">
            <div className="ts">2026-05-16 02:09:47</div>
            <div className="src">Vercel</div>
            <div className="proj">acme-app · main</div>
            <div className="act">prod deploy · scan complete</div>
            <div className="st">SCAN DONE</div>
          </div>
          <div className="hook-row">
            <div className="ts">2026-05-15 18:42:18</div>
            <div className="src">GitHub</div>
            <div className="proj">acme-app</div>
            <div className="act">push to non-prod branch</div>
            <div className="st ignored">IGNORED</div>
          </div>
          <div className="hook-row">
            <div className="ts">2026-05-15 09:11:30</div>
            <div className="src">Vercel</div>
            <div className="proj">acme-app · preview</div>
            <div className="act">preview deploy</div>
            <div className="st ignored">IGNORED</div>
          </div>
          <div className="hook-row">
            <div className="ts">2026-05-12 14:08:55</div>
            <div className="src">Vercel</div>
            <div className="proj">acme-app · main</div>
            <div className="act">prod deploy · scan complete</div>
            <div className="st">SCAN DONE</div>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
