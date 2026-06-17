import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import { createServerClient } from '@/lib/supabase/server'
import '../app.css'

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  starter: 'Starter — one-off scans',
  monitor: 'Monitor — continuous',
}

const PLAN_PRICES: Record<string, string> = {
  free: '$0 / month',
  starter: '$9 / scan',
  monitor: '$19 / month',
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: 'Passive scan only. No active probes, no badge, no report sharing.',
  starter: 'One-off active scans with shareable report and trust badge.',
  monitor: 'Continuous monitoring, deploy-triggered re-scans, CVE alerts, and up to 5 URLs.',
}

const URL_LIMITS: Record<string, number> = { free: 1, starter: 1, monitor: 5 }

export default async function BillingPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ data: profile }, { count: scanCount }, { count: urlCount }] = await Promise.all([
    supabase.from('profiles').select('plan, stripe_customer_id, stripe_subscription_status').eq('id', user.id).single(),
    supabase.from('scans').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', startOfMonth),
    supabase.from('urls').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('deleted_at', null),
  ])

  const plan = (profile?.plan ?? 'free') as string
  const hasStripe = !!profile?.stripe_customer_id
  const urlLimit = URL_LIMITS[plan] ?? 1
  const urlsUsed = urlCount ?? 0
  const scansUsed = scanCount ?? 0

  return (
    <AppShell activeNav="billing">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Billing &amp; plan</h1>
            <div className="greeting-sub">manage subscription · view invoices · update payment method</div>
          </div>
        </div>

        <h2 className="section-label">Current plan</h2>
        <div className="billing-grid">
          <div className="plan-card">
            <div className="stripe" />
            <div className="ptag">Active plan</div>
            <h2 className="pname">{PLAN_NAMES[plan] ?? plan}</h2>
            <p className="pdesc">{PLAN_DESCRIPTIONS[plan]}</p>
            <div className="plan-meta">
              <div>
                <div className="lbl">Price</div>
                <div className="val">{PLAN_PRICES[plan]}</div>
              </div>
              <div>
                <div className="lbl">Scans this month</div>
                <div className="val lime">{scansUsed}</div>
              </div>
              <div>
                <div className="lbl">URLs monitored</div>
                <div className="val">{urlsUsed} / {urlLimit}</div>
              </div>
            </div>
            <div className="pactions">
              {plan === 'free' && (
                <Link href="/api/billing/checkout?plan=starter" className="btn btn-lime">↑ Upgrade to Starter</Link>
              )}
              {plan === 'starter' && (
                <Link href="/api/billing/checkout?plan=monitor" className="btn btn-lime">↑ Upgrade to Monitor</Link>
              )}
              {plan === 'monitor' && (
                <Link href="/api/billing/portal" className="btn btn-outline">Manage subscription</Link>
              )}
            </div>
          </div>

          <div className="renewal-card">
            <h3>Payment method</h3>
            {hasStripe ? (
              <>
                <div className="rdate">
                  <a href="/api/billing/portal" style={{ color: 'var(--violet)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    Manage payment method →
                  </a>
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-soft)' }}>
                  View and update your card, billing address, and invoices in the Stripe portal.
                </div>
              </>
            ) : (
              <>
                <div className="rdate" style={{ color: 'var(--ink-mute)' }}>No payment method on file</div>
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-soft)' }}>
                  Upgrade to a paid plan to add a payment method.
                </div>
                {plan === 'free' && (
                  <div className="renewal-footer" style={{ marginTop: 16 }}>
                    <a href="/api/billing/portal" style={{ color: 'var(--violet)' }}>Add payment method →</a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <h2 className="section-label">Usage this month</h2>
        <div className="usage">
          <div className="usage-stat">
            <div className="lbl">Scans run</div>
            <div className="val-row">
              <span className="val">{scansUsed}</span>
              <span className="denom">/ {plan === 'free' ? '1 free' : 'unlimited'}</span>
            </div>
            <div className="meter">
              <div className="fill" style={{ width: plan === 'free' ? `${Math.min(100, scansUsed * 100)}%` : `${Math.min(100, (scansUsed / 20) * 100)}%` }} />
            </div>
            <div className="meter-note">
              {scansUsed === 0 ? 'no scans yet this month' : `${scansUsed} scan${scansUsed !== 1 ? 's' : ''} completed`}
            </div>
          </div>
          <div className="usage-stat">
            <div className="lbl">URLs monitored</div>
            <div className="val-row">
              <span className="val">{urlsUsed}</span>
              <span className="denom">/ {urlLimit} on {plan}</span>
            </div>
            <div className="meter">
              <div className={`fill ${urlsUsed >= urlLimit ? 'warn' : ''}`} style={{ width: `${Math.min(100, (urlsUsed / urlLimit) * 100)}%` }} />
            </div>
            <div className="meter-note">
              {urlsUsed >= urlLimit
                ? `at limit · ${plan !== 'monitor' ? 'upgrade to add more' : 'maximum reached'}`
                : `${urlLimit - urlsUsed} slot${urlLimit - urlsUsed !== 1 ? 's' : ''} remaining`}
            </div>
          </div>
          <div className="usage-stat">
            <div className="lbl">Reports generated</div>
            <div className="val-row"><span className="val">{scansUsed}</span><span className="denom">total</span></div>
            <div className="meter"><div className="fill lime" style={{ width: `${Math.min(100, (scansUsed / 20) * 100)}%` }} /></div>
            <div className="meter-note">one report per completed scan</div>
          </div>
        </div>

        <h2 className="section-label">Plan comparison</h2>
        <div className="compare">
          <div className="compare-row head">
            <div><span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, color: 'var(--ink-mute)' }}>features</span></div>
            <div style={{ background: plan === 'free' ? 'var(--lime-soft, #f7ffe0)' : undefined }}>
              Free
              {plan === 'free' && <span className="current-badge">current</span>}
              <div className="price">$0<small> / month</small></div>
            </div>
            <div style={{ background: plan === 'starter' ? 'var(--lime-soft, #f7ffe0)' : undefined }}>
              One-off
              {plan === 'starter' && <span className="current-badge">current</span>}
              <div className="price">$9<small> / scan</small></div>
            </div>
            <div style={{ background: plan === 'monitor' ? 'var(--lime-soft, #f7ffe0)' : undefined }}>
              <span style={{ color: 'var(--violet)' }}>Monitor</span>
              {plan === 'monitor' && <span className="current-badge">current</span>}
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
            <div>
              {plan === 'free'
                ? <button className="current-btn">current plan</button>
                : <Link href="/api/billing/portal" className="upgrade-btn">Downgrade to Free</Link>}
            </div>
            <div>
              {plan === 'starter'
                ? <button className="current-btn">current plan</button>
                : <Link href="/api/billing/checkout?plan=starter" className="upgrade-btn">
                    {plan === 'free' ? 'Upgrade to Starter →' : 'Switch to Starter'}
                  </Link>}
            </div>
            <div>
              {plan === 'monitor'
                ? <button className="current-btn">current plan</button>
                : <Link href="/api/billing/checkout?plan=monitor" className="upgrade-btn">Upgrade to Monitor →</Link>}
            </div>
          </div>
        </div>

        <h2 className="section-label">Invoice history</h2>
        <div className="invoices" style={{ padding: '24px 28px' }}>
          {hasStripe ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
                View your complete billing history, download PDF receipts, and manage invoices in the Stripe portal.
              </div>
              <a href="/api/billing/portal" className="btn btn-soft" style={{ padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>
                View invoices →
              </a>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              No invoices yet — you&apos;re on the free plan.
            </div>
          )}
        </div>

        <div style={{ marginTop: 60, padding: 24, border: '1px dashed var(--line)', borderRadius: 'var(--radius)', background: 'var(--bg-sub)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>Cancel anytime, no friction.</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>No &quot;are you sure?&quot; 4-step survey. We hate them too.</p>
          </div>
          {hasStripe && (
            <a href="/api/billing/portal" className="btn btn-soft" style={{ color: 'var(--ink-soft)' }}>
              Manage subscription
            </a>
          )}
        </div>
      </main>
    </AppShell>
  )
}
