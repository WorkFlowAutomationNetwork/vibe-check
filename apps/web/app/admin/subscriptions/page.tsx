import { createServiceClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

interface SubscriptionRow {
  id: string
  email: string
  name: string | null
  plan: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
}

export default async function AdminSubscriptionsPage() {
  const service = createServiceClient()

  // Get all paid users
  const { data: profiles } = await service
    .from('profiles')
    .select('id, plan, name, stripe_customer_id, stripe_subscription_id, created_at')
    .in('plan', ['starter', 'monitor'])
    .order('created_at', { ascending: false })

  const rows = profiles ?? []
  const userIds = rows.map(p => p.id)

  // Fetch emails from auth admin API
  const emailMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: authData } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of authData?.users ?? []) {
      emailMap.set(u.id, u.email ?? '—')
    }
  }

  const subs: SubscriptionRow[] = rows.map(p => ({
    id: p.id,
    email: emailMap.get(p.id) ?? '—',
    name: p.name,
    plan: p.plan,
    stripe_customer_id: p.stripe_customer_id,
    stripe_subscription_id: p.stripe_subscription_id,
    created_at: p.created_at,
  }))

  const starterCount = subs.filter(s => s.plan === 'starter').length
  const monitorCount = subs.filter(s => s.plan === 'monitor').length
  const estimatedMRR = starterCount * 15 + monitorCount * 35

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  return (
    <AdminShell activeNav="subscriptions">
      <main className="admin-main">
        <div className="admin-topline">
          <div>
            <h1 className="admin-title">Subscriptions</h1>
            <div className="admin-subtitle">Paying accounts and billing overview</div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="admin-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 28 }}>
          <div className="admin-stat lime">
            <div className="admin-stat-label">Est. MRR</div>
            <div className="admin-stat-value">${estimatedMRR}</div>
            <div className="admin-stat-sub">{subs.length} paying accounts</div>
          </div>
          <div className="admin-stat violet">
            <div className="admin-stat-label">Starter ($15)</div>
            <div className="admin-stat-value">{starterCount}</div>
            <div className="admin-stat-sub">one-off scan accounts</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-label">Monitor ($35/mo)</div>
            <div className="admin-stat-value">{monitorCount}</div>
            <div className="admin-stat-sub">recurring subscriptions</div>
          </div>
        </div>

        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <span className="admin-table-title">Paid Accounts</span>
            <a
              href="https://dashboard.stripe.com/customers"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-admin"
            >
              Open Stripe ↗
            </a>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Plan</th>
                <th>Stripe Customer</th>
                <th>Stripe Subscription</th>
                <th>Upgraded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-empty">No paying users yet</td>
                </tr>
              )}
              {subs.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.email}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{s.name ?? '—'}</td>
                  <td><span className={`plan-tag ${s.plan}`}>{s.plan}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
                    {s.stripe_customer_id ? (
                      <a
                        href={`https://dashboard.stripe.com/customers/${s.stripe_customer_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--violet)' }}
                      >
                        {s.stripe_customer_id.slice(0, 14)}…
                      </a>
                    ) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
                    {s.stripe_subscription_id ? (
                      <a
                        href={`https://dashboard.stripe.com/subscriptions/${s.stripe_subscription_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--violet)' }}
                      >
                        {s.stripe_subscription_id.slice(0, 14)}…
                      </a>
                    ) : '—'}
                  </td>
                  <td style={{ color: 'var(--ink-mute)', fontSize: 12 }}>{fmt(s.created_at)}</td>
                  <td>
                    <div className="admin-actions">
                      <a href={`/admin/users/${s.id}`} className="btn-admin">View user</a>
                      <form method="POST" action={`/api/admin/users/${s.id}`} style={{ display: 'inline' }}>
                        <input type="hidden" name="plan" value="free" />
                        <button
                          type="submit"
                          className="btn-admin danger"
                          title="Downgrade to Free"
                        >
                          Downgrade
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="admin-panel"
          style={{ background: 'var(--violet-soft)', borderColor: 'var(--violet)' }}
        >
          <div className="admin-panel-title">Stripe Integration Note</div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
            Subscription billing is managed in Stripe. Use the links above to open individual
            customers in the Stripe dashboard. To cancel, pause, or refund a subscription, do so
            from the Stripe dashboard directly. Plan changes made here update the Supabase record
            but do <strong>not</strong> cancel the Stripe subscription automatically — handle that
            in Stripe separately.
          </p>
        </div>
      </main>
    </AdminShell>
  )
}
