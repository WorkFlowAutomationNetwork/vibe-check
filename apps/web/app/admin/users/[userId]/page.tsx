import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

const PLAN_OPTIONS = ['free', 'starter', 'monitor'] as const

interface Profile {
  plan: string
  is_admin: boolean
  name: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  default_scan_depth: string
  notify_scan_complete: boolean
  created_at: string
  updated_at: string
}

interface Scan {
  id: string
  type: string
  status: string
  grade: string | null
  started_at: string | null
  completed_at: string | null
}

interface UrlRow {
  id: string
  url: string
  verified: boolean
  created_at: string
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: { userId: string }
}) {
  const service = createServiceClient()

  const [{ data: authUser, error }, profileResult, urlsResult, scansResult] = await Promise.all([
    service.auth.admin.getUserById(params.userId),
    service
      .from('profiles')
      .select('*')
      .eq('id', params.userId)
      .single(),
    service
      .from('urls')
      .select('id, url, verified, created_at')
      .eq('user_id', params.userId)
      .order('created_at', { ascending: false })
      .limit(10),
    service
      .from('scans')
      .select('id, type, status, grade, started_at, completed_at')
      .eq('user_id', params.userId)
      .order('started_at', { ascending: false })
      .limit(10),
  ])

  if (error || !authUser) notFound()

  const profile = profileResult.data as Profile | null
  const urls = (urlsResult.data ?? []) as UrlRow[]
  const scans = (scansResult.data ?? []) as Scan[]

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—'

  const email = authUser.user.email ?? '—'

  return (
    <AdminShell activeNav="users">
      <main className="admin-main">
        {/* Header */}
        <div className="admin-topline">
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginBottom: 4 }}>
              <a href="/admin/users" style={{ color: 'var(--violet)' }}>Users</a> / {email}
            </div>
            <h1 className="admin-title">{profile?.name ?? email.split('@')[0]}</h1>
            <div className="admin-subtitle" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {email}
            </div>
          </div>
          <div className="admin-actions">
            <form method="POST" action={`/api/admin/users/${params.userId}`}>
              <input type="hidden" name="_method" value="DELETE" />
              <button
                type="submit"
                className="btn-admin danger"
                onClick={() => confirm('Delete this account permanently? This cannot be undone.')}
              >
                Delete account
              </button>
            </form>
          </div>
        </div>

        <div className="admin-detail-grid">
          {/* ── LEFT: Account info + edit ── */}
          <div>
            <div className="admin-panel">
              <div className="admin-panel-title">Account Details</div>
              <div className="admin-kv">
                <div className="admin-kv-row">
                  <span className="admin-kv-label">User ID</span>
                  <span className="admin-kv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {authUser.user.id.slice(0, 18)}…
                  </span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Email</span>
                  <span className="admin-kv-val">{email}</span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Email verified</span>
                  <span className="admin-kv-val">
                    {authUser.user.email_confirmed_at ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Joined</span>
                  <span className="admin-kv-val">{fmt(authUser.user.created_at)}</span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Last sign-in</span>
                  <span className="admin-kv-val">{fmt(authUser.user.last_sign_in_at ?? null)}</span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Plan</span>
                  <span className="admin-kv-val">
                    <span className={`plan-tag ${profile?.plan ?? 'free'}`}>
                      {profile?.plan ?? 'free'}
                    </span>
                  </span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Admin</span>
                  <span className="admin-kv-val">
                    {profile?.is_admin ? <span className="admin-pill">Yes</span> : 'No'}
                  </span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Stripe customer</span>
                  <span className="admin-kv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {profile?.stripe_customer_id ?? '—'}
                  </span>
                </div>
                <div className="admin-kv-row">
                  <span className="admin-kv-label">Stripe subscription</span>
                  <span className="admin-kv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {profile?.stripe_subscription_id ?? '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── EDIT PANEL ── */}
            <div className="admin-panel">
              <div className="admin-panel-title">Edit Account</div>
              <form
                method="POST"
                action={`/api/admin/users/${params.userId}`}
                style={{ display: 'grid', gap: 12 }}
              >
                <div className="admin-field">
                  <label>Display name</label>
                  <input
                    name="name"
                    defaultValue={profile?.name ?? ''}
                    placeholder="Full name"
                  />
                </div>
                <div className="admin-field">
                  <label>Plan</label>
                  <select name="plan" defaultValue={profile?.plan ?? 'free'}>
                    {PLAN_OPTIONS.map(p => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                        {p === 'free' ? ' (Free)' : p === 'starter' ? ' ($9 one-off)' : ' ($19/mo)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-field">
                  <label>Admin access</label>
                  <select name="is_admin" defaultValue={profile?.is_admin ? 'true' : 'false'}>
                    <option value="false">No</option>
                    <option value="true">Yes — grant admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn-admin primary">Save changes</button>
                </div>
              </form>
            </div>

            {/* ── PASSWORD RESET ── */}
            <div className="admin-panel">
              <div className="admin-panel-title">Authentication</div>
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <form method="POST" action={`/api/admin/users/${params.userId}/send-reset`}>
                  <button type="submit" className="btn-admin" style={{ width: '100%' }}>
                    Send password reset email
                  </button>
                </form>
                <form method="POST" action={`/api/admin/users/${params.userId}/confirm-email`}>
                  <button type="submit" className="btn-admin" style={{ width: '100%' }}>
                    Force confirm email
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* ── RIGHT: URLs + Scans ── */}
          <div>
            <div className="admin-section-label">URLs ({urls.length})</div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Verified</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {urls.length === 0 && (
                    <tr><td colSpan={3} className="admin-empty">No URLs added</td></tr>
                  )}
                  {urls.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.url}</td>
                      <td>{u.verified ? '✓' : '—'}</td>
                      <td style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
                        {fmt(u.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-section-label">Recent Scans ({scans.length})</div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Grade</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.length === 0 && (
                    <tr><td colSpan={4} className="admin-empty">No scans yet</td></tr>
                  )}
                  {scans.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
                        {s.type}
                      </td>
                      <td>
                        <span className={`status-dot ${s.status}`}>{s.status}</span>
                      </td>
                      <td>
                        {s.grade
                          ? <span className="grade-chip">{s.grade}</span>
                          : <span style={{ color: 'var(--ink-mute)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
                        {fmt(s.started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </AdminShell>
  )
}
