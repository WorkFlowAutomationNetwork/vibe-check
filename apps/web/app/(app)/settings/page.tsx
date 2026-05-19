import Link from 'next/link'
import AppShell from '@/components/shared/AppShell'
import '../app.css'

export default function SettingsPage() {
  return (
    <AppShell activeNav="settings">
      <main className="app-main">
        <div className="settings-inner">
          <div className="topline">
            <div>
              <h1 className="greeting">Settings</h1>
              <div className="greeting-sub">profile · notifications · scan defaults</div>
            </div>
          </div>

          <section className="settings-section">
            <h2 className="section-label">Profile</h2>
            <div className="field-row">
              <div className="field">
                <label>Name</label>
                <input type="text" defaultValue="Your Name" />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" defaultValue="you@example.com" />
                <div className="helper">Email changes require verification.</div>
              </div>
            </div>
            <div className="field">
              <label>Current password</label>
              <input type="password" placeholder="••••••••" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>New password</label>
                <input type="password" placeholder="at least 12 chars" />
              </div>
              <div className="field">
                <label>Confirm</label>
                <input type="password" placeholder="match above" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-primary">Save changes</button>
            </div>
          </section>

          <section className="settings-section">
            <h2 className="section-label">Notifications</h2>
            <div className="toggle-row">
              <div className="toggle-text">
                <h4>New CVE matched to your stack</h4>
                <p>Email (+ Slack if connected) the moment something in your deps gets a CVE.</p>
              </div>
              <div className="toggle on" />
            </div>
            <div className="toggle-row">
              <div className="toggle-text">
                <h4>Scan completed</h4>
                <p>Only useful if you run a lot of manual scans. Off by default.</p>
              </div>
              <div className="toggle" />
            </div>
            <div className="toggle-row">
              <div className="toggle-text">
                <h4>Badge expiring in 7 days</h4>
                <p>Heads-up email so your public badge doesn&apos;t quietly lapse.</p>
              </div>
              <div className="toggle on" />
            </div>
            <div className="toggle-row">
              <div className="toggle-text">
                <h4>Weekly digest</h4>
                <p>Friday summary of scans, findings closed, new CVEs. Useful in team settings.</p>
              </div>
              <div className="toggle" />
            </div>
            <div className="slack-cta">
              <span style={{ color: 'var(--ink-mute)' }}>↪</span>
              Slack not connected — <Link href="/integrations">connect Slack</Link> to route the above into a channel.
            </div>
          </section>

          <section className="settings-section">
            <h2 className="section-label">Scan defaults</h2>

            <div className="field">
              <label>Scan depth</label>
              <div className="radio-group">
                <div className="radio-card">
                  <div className="radio-dot" />
                  <div className="radio-text">
                    <h4>Passive only</h4>
                    <p>HTTP + DNS analysis. No requests to your app&apos;s auth or write endpoints.</p>
                  </div>
                </div>
                <div className="radio-card selected">
                  <div className="radio-dot" />
                  <div className="radio-text">
                    <h4>Active <span className="pill-mini">default</span></h4>
                    <p>~180 probes including known exploits. Read-only — never destructive.</p>
                  </div>
                </div>
                <div className="radio-card">
                  <div className="radio-dot" />
                  <div className="radio-text">
                    <h4>Deep</h4>
                    <p>Slower (~3 min), more intrusive. Brute-force probes against auth endpoints. May trigger WAFs.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="field">
              <label>Rate limit mode</label>
              <div className="radio-group">
                <div className="radio-card selected">
                  <div className="radio-dot" />
                  <div className="radio-text">
                    <h4>Polite <span className="pill-mini">default · 10 req/s</span></h4>
                    <p>Most apps handle this fine. Adds ~15s to scan duration.</p>
                  </div>
                </div>
                <div className="radio-card">
                  <div className="radio-dot" />
                  <div className="radio-text">
                    <h4>Fast <span className="pill-mini" style={{ color: '#7A4612', background: 'var(--warn-soft)' }}>50 req/s</span></h4>
                    <p>For apps you know won&apos;t block you — staging environments, apps without WAFs. Will trigger Cloudflare/Vercel WAF on prod.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="field">
              <label>WAF IP allowlist</label>
              <div className="int-webhook" style={{ marginTop: 0 }}>
                <span className="val">52.18.41.20  ·  52.18.41.21  ·  3.122.18.5  ·  3.122.18.6  ·  18.193.0.142</span>
                <button>copy</button>
              </div>
              <div className="helper">Add these to your WAF allowlist if scans get rate-limited.</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-primary">Save defaults</button>
            </div>
          </section>

          <section className="settings-section">
            <h2 className="section-label" style={{ color: '#84260F' }}>Danger zone</h2>
            <div className="danger-zone">
              <h3>Export or delete your data</h3>
              <p>Deletion is permanent. Reports, grades, and badge history are gone. We keep anonymised aggregate stats for trend research — nothing identifying.</p>
              <div className="danger-actions">
                <button className="btn btn-soft">⇩ Export all data (JSON)</button>
                <button className="btn btn-danger">Delete account</button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  )
}
