import Link from 'next/link'
import AppShell from '@/components/shared/AppShell'
import '../app.css'

export default function BillingPage() {
  return (
    <AppShell activeNav="billing">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Billing &amp; plan</h1>
            <div className="greeting-sub">manage subscription · view invoices · update payment method</div>
          </div>
          <button className="btn btn-soft">⇩ Export tax summary</button>
        </div>

        <h2 className="section-label">Current plan</h2>
        <div className="billing-grid">
          <div className="plan-card">
            <div className="stripe" />
            <div className="ptag">Active subscription</div>
            <h2 className="pname">Starter <span className="small">— one-off scans</span></h2>
            <p className="pdesc">You&apos;ve spent $126 on one-off scans this month. Monitor at $19/mo would have covered every one of them — with continuous re-scans thrown in. Make of that what you will.</p>
            <div className="plan-meta">
              <div>
                <div className="lbl">Monthly cost</div>
                <div className="val">$0.00 base</div>
              </div>
              <div>
                <div className="lbl">Scans this month</div>
                <div className="val lime">14 × $9 = $126</div>
              </div>
              <div>
                <div className="lbl">Next invoice</div>
                <div className="val">Jun 01, 2026</div>
              </div>
            </div>
            <div className="pactions">
              <button className="btn btn-lime">↑ Upgrade to Monitor</button>
              <button className="btn btn-outline">Switch to annual</button>
            </div>
          </div>

          <div className="renewal-card">
            <h3>Payment method</h3>
            <div className="rdate">renews next on <b>Jun 01, 2026</b></div>
            <div className="card-on-file">
              <div className="ico visa">VISA</div>
              <div className="meta">
                <div>•••• •••• •••• 4242</div>
                <small>expires 08/29 · added Mar 18 · billing zip 94110</small>
              </div>
            </div>
            <div className="renewal-footer">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>backup card not set</span>
              <a href="/api/billing/portal">Manage payment →</a>
            </div>
          </div>
        </div>

        <h2 className="section-label">Usage this month</h2>
        <div className="usage">
          <div className="usage-stat">
            <div className="lbl">Scans run</div>
            <div className="val-row"><span className="val">14</span><span className="denom">/ unlimited</span></div>
            <div className="meter"><div className="fill" style={{ width: '35%' }} /></div>
            <div className="meter-note">avg 3.5 scans/week · trending up</div>
          </div>
          <div className="usage-stat">
            <div className="lbl">URLs monitored</div>
            <div className="val-row"><span className="val">1</span><span className="denom">/ 1 on Starter</span></div>
            <div className="meter"><div className="fill warn" style={{ width: '100%' }} /></div>
            <div className="meter-note">at limit · upgrade to add another URL</div>
          </div>
          <div className="usage-stat">
            <div className="lbl">Reports generated</div>
            <div className="val-row"><span className="val">14</span><span className="denom">PDFs · 11 shared</span></div>
            <div className="meter"><div className="fill lime" style={{ width: '78%' }} /></div>
            <div className="meter-note">avg report opened 4× by readers</div>
          </div>
        </div>

        <h2 className="section-label">Plan comparison</h2>
        <div className="compare">
          <div className="compare-row head">
            <div><span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, color: 'var(--ink-mute)' }}>features</span></div>
            <div>
              Free
              <div className="price">$0<small> / month</small></div>
            </div>
            <div style={{ background: 'var(--lime-soft)' }}>
              One-off <span className="current-badge">current</span>
              <div className="price">$9<small> / scan</small></div>
            </div>
            <div>
              <span style={{ color: 'var(--violet)' }}>Monitor</span>
              <div className="price">$19<small> / month</small></div>
            </div>
          </div>
          <div className="compare-row">
            <div className="feat">Passive HTTP &amp; DNS analysis</div>
            <div className="v yes">✓</div>
            <div className="v yes">✓</div>
            <div className="v yes">✓</div>
          </div>
          <div className="compare-row">
            <div className="feat">Active probes (auth, prompt injection, IDOR)</div>
            <div className="v no">—</div>
            <div className="v yes">✓</div>
            <div className="v yes">✓</div>
          </div>
          <div className="compare-row">
            <div className="feat">Shareable HTML report + PDF export</div>
            <div className="v no">—</div>
            <div className="v yes">✓</div>
            <div className="v yes">✓</div>
          </div>
          <div className="compare-row">
            <div className="feat">&quot;Vibe-Checked ✓&quot; public badge</div>
            <div className="v no">—</div>
            <div className="v">30 days</div>
            <div className="v yes">always on</div>
          </div>
          <div className="compare-row">
            <div className="feat">Deploy-triggered re-scans</div>
            <div className="v no">—</div>
            <div className="v no">—</div>
            <div className="v yes">✓ webhook</div>
          </div>
          <div className="compare-row">
            <div className="feat">CVE alerts (email + Slack)</div>
            <div className="v no">—</div>
            <div className="v no">—</div>
            <div className="v yes">✓</div>
          </div>
          <div className="compare-row">
            <div className="feat">URLs included</div>
            <div className="v">1</div>
            <div className="v">1 per scan</div>
            <div className="v yes">up to 5</div>
          </div>
          <div className="compare-row foot">
            <div />
            <div><button className="current-btn">— not on plan —</button></div>
            <div><button className="current-btn">current plan</button></div>
            <div><button className="upgrade-btn">Upgrade to Monitor →</button></div>
          </div>
        </div>

        <h2 className="section-label">Invoice history</h2>
        <div className="invoices">
          <div className="invoice-row head">
            <div>Date</div>
            <div>Description</div>
            <div>Amount</div>
            <div>Status</div>
            <div>Receipt</div>
          </div>
          <div className="invoice-row">
            <div>2026-05-16</div>
            <div>Active scan · acme-app.vercel.app</div>
            <div className="amt">$9.00</div>
            <div className="stat">paid</div>
            <div className="dl">⇩ PDF</div>
          </div>
          <div className="invoice-row">
            <div>2026-05-04</div>
            <div>Active scan · api.acme-app.com</div>
            <div className="amt">$9.00</div>
            <div className="stat">paid</div>
            <div className="dl">⇩ PDF</div>
          </div>
          <div className="invoice-row">
            <div>2026-04-18</div>
            <div>Active scan · acme-app.vercel.app</div>
            <div className="amt">$9.00</div>
            <div className="stat refund">refunded</div>
            <div className="dl">⇩ PDF</div>
          </div>
        </div>

        <div style={{ marginTop: 60, padding: 24, border: '1px dashed var(--line-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-sub)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>Cancel anytime, no friction.</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>No &quot;are you sure?&quot; 4-step survey. We hate them too.</p>
          </div>
          <button className="btn btn-soft" style={{ color: 'var(--ink-soft)' }}>Cancel subscription</button>
        </div>
      </main>
    </AppShell>
  )
}
