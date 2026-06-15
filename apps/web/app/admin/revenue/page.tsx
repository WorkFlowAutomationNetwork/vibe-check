import { createServiceClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

// Placeholder infrastructure cost estimates (update when actual billing known)
const INFRA_COSTS = [
  { label: 'Fly.io (scanner)', monthly: 7, note: '1 shared-cpu-1x, 512 MB' },
  { label: 'Fly.io (Redis)', monthly: 3, note: 'Upstash managed Redis' },
  { label: 'Supabase', monthly: 0, note: 'Free tier (upgrade at ~500 MAU)' },
  { label: 'Vercel', monthly: 0, note: 'Hobby / Pro plan TBD' },
  { label: 'Resend (email)', monthly: 0, note: 'Free tier (3k/month)' },
]

const TOTAL_INFRA = INFRA_COSTS.reduce((sum, c) => sum + c.monthly, 0)

export default async function AdminRevenuePage() {
  const service = createServiceClient()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [profilesResult, scansThisMonthResult, allScansResult] = await Promise.all([
    service.from('profiles').select('id, plan, created_at'),
    service
      .from('scans')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    service
      .from('scans')
      .select('id, created_at, scan_type')
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const profiles = profilesResult.data ?? []
  const totalUsers = profiles.length
  const freeUsers = profiles.filter(p => p.plan === 'free').length
  const starterUsers = profiles.filter(p => p.plan === 'starter').length
  const monitorUsers = profiles.filter(p => p.plan === 'monitor').length

  const mrr = starterUsers * 9 + monitorUsers * 19
  const arr = mrr * 12
  const netMRR = mrr - TOTAL_INFRA

  const scansThisMonth = scansThisMonthResult.count ?? 0
  const conversionRate = totalUsers > 0
    ? Math.round(((starterUsers + monitorUsers) / totalUsers) * 100)
    : 0

  // New users this month
  const newUsersThisMonth = profiles.filter(
    p => new Date(p.created_at) >= startOfMonth,
  ).length

  const allScans = allScansResult.data ?? []

  // Scans by type
  const scansByType: Record<string, number> = {}
  for (const s of allScans) {
    scansByType[s.scan_type] = (scansByType[s.scan_type] ?? 0) + 1
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  const monthName = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

  return (
    <AdminShell activeNav="revenue">
      <main className="admin-main">
        <div className="admin-topline">
          <div>
            <h1 className="admin-title">Revenue & Costs</h1>
            <div className="admin-subtitle">Financial overview · {monthName}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-admin"
            >
              Open Stripe ↗
            </a>
          </div>
        </div>

        {/* Revenue headline */}
        <div className="admin-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="admin-stat lime">
            <div className="admin-stat-label">Est. MRR</div>
            <div className="admin-stat-value">${mrr}</div>
            <div className="admin-stat-sub">{starterUsers + monitorUsers} paying accounts</div>
          </div>
          <div className="admin-stat lime">
            <div className="admin-stat-label">Net MRR</div>
            <div className="admin-stat-value">${netMRR}</div>
            <div className="admin-stat-sub">after ~${TOTAL_INFRA} infra costs</div>
          </div>
          <div className="admin-stat violet">
            <div className="admin-stat-label">ARR (Est.)</div>
            <div className="admin-stat-value">${arr}</div>
            <div className="admin-stat-sub">annualised at current MRR</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-label">Conversion Rate</div>
            <div className="admin-stat-value">{conversionRate}%</div>
            <div className="admin-stat-sub">{totalUsers} total users</div>
          </div>
        </div>

        {/* Plan breakdown */}
        <div className="admin-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 0 }}>
          <div className="admin-stat">
            <div className="admin-stat-label">Free</div>
            <div className="admin-stat-value">{freeUsers}</div>
            <div className="admin-stat-sub">$0 MRR · passive scans only</div>
          </div>
          <div className="admin-stat violet">
            <div className="admin-stat-label">Starter ($9 one-off)</div>
            <div className="admin-stat-value">{starterUsers}</div>
            <div className="admin-stat-sub">${starterUsers * 9} recognised revenue</div>
          </div>
          <div className="admin-stat lime">
            <div className="admin-stat-label">Monitor ($19/mo)</div>
            <div className="admin-stat-value">{monitorUsers}</div>
            <div className="admin-stat-sub">${monitorUsers * 19}/mo recurring</div>
          </div>
        </div>

        {/* This month summary */}
        <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
          <div className="admin-table-head">
            <span className="admin-table-title">This Month — {monthName}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
            <div style={{ padding: '20px 24px', borderRight: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                New Signups
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{newUsersThisMonth}</div>
            </div>
            <div style={{ padding: '20px 24px', borderRight: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Scans Run
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{scansThisMonth}</div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Stripe (placeholder)
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-mute)', marginTop: 8 }}>
                Connect Stripe API for live invoice data
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Infrastructure costs */}
          <div className="admin-table-wrap" style={{ marginBottom: 0 }}>
            <div className="admin-table-head">
              <span className="admin-table-title">Infrastructure Costs (Est.)</span>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Note</th>
                  <th style={{ textAlign: 'right' }}>$/mo</th>
                </tr>
              </thead>
              <tbody>
                {INFRA_COSTS.map(c => (
                  <tr key={c.label}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.label}</td>
                    <td style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{c.note}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {c.monthly === 0 ? <span style={{ color: 'var(--lime-deep)' }}>Free</span> : `$${c.monthly}`}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--ink)' }}>
                  <td colSpan={2} style={{ fontWeight: 700 }}>Total est. monthly infra</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    ${TOTAL_INFRA}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Scan type breakdown */}
          <div className="admin-table-wrap" style={{ marginBottom: 0 }}>
            <div className="admin-table-head">
              <span className="admin-table-title">Scan Types (Last 90d)</span>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Count</th>
                  <th style={{ textAlign: 'right' }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {allScans.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="admin-empty">No scans yet</td>
                  </tr>
                ) : (
                  Object.entries(scansByType)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <tr key={type}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{type}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{count}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-mute)' }}>
                          {Math.round((count / allScans.length) * 100)}%
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>

            {/* Revenue opportunity */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Revenue opportunity
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                {freeUsers} free users. If <strong>10%</strong> convert to Starter: <strong>+${Math.round(freeUsers * 0.1) * 9}/mo</strong>.<br />
                If <strong>5%</strong> convert to Monitor: <strong>+${Math.round(freeUsers * 0.05) * 19}/mo</strong>.
              </div>
            </div>
          </div>
        </div>

        {/* Stripe placeholder panel */}
        <div
          className="admin-panel"
          style={{ background: 'var(--violet-soft)', borderColor: 'var(--violet)', marginBottom: 0 }}
        >
          <div className="admin-panel-title">Stripe Integration — Pending</div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
            Revenue figures above are estimated from profile plan data in Supabase.
            Connect the Stripe API (add <code>STRIPE_SECRET_KEY</code> usage here) to pull live
            invoice history, payment failures, churn data, and MRR reconciliation.
            Until then, use the{' '}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--violet)' }}>
              Stripe dashboard
            </a>{' '}
            directly for authoritative revenue data.
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <a
              href="https://dashboard.stripe.com/payments"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-admin"
            >
              Payments ↗
            </a>
            <a
              href="https://dashboard.stripe.com/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-admin"
            >
              Subscriptions ↗
            </a>
            <a
              href="https://dashboard.stripe.com/customers"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-admin"
            >
              Customers ↗
            </a>
          </div>
        </div>
      </main>
    </AdminShell>
  )
}
