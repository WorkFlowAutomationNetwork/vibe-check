import { createServiceClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  plan: string
  is_admin: boolean
  name: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string }
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const perPage = 20
  const query = searchParams.q ?? ''

  const service = createServiceClient()

  const { data: authData } = await service.auth.admin.listUsers({
    page,
    perPage,
  })

  const authUsers = authData?.users ?? []
  const userIds = authUsers.map(u => u.id)

  const { data: profiles } = userIds.length
    ? await service
        .from('profiles')
        .select('id, plan, is_admin, name, stripe_customer_id, stripe_subscription_id')
        .in('id', userIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  let users: UserRow[] = authUsers.map(u => ({
    id: u.id,
    email: u.email ?? '—',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    plan: profileMap.get(u.id)?.plan ?? 'free',
    is_admin: profileMap.get(u.id)?.is_admin ?? false,
    name: profileMap.get(u.id)?.name ?? null,
    stripe_customer_id: profileMap.get(u.id)?.stripe_customer_id ?? null,
    stripe_subscription_id: profileMap.get(u.id)?.stripe_subscription_id ?? null,
  }))

  // Client-side filter by query (server-side full text search not available via admin API without custom view)
  if (query) {
    const q = query.toLowerCase()
    users = users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      (u.name ?? '').toLowerCase().includes(q),
    )
  }

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—'

  return (
    <AdminShell activeNav="users">
      <main className="admin-main">
        <div className="admin-topline">
          <div>
            <h1 className="admin-title">Users</h1>
            <div className="admin-subtitle">
              Manage accounts, plans, and admin access
            </div>
          </div>
          <a href="/admin/users/new" className="btn-admin primary">+ Create user</a>
        </div>

        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <span className="admin-table-title">
              All accounts {query && `· filtered: "${query}"`}
            </span>
            <form method="GET" style={{ display: 'flex', gap: 8 }}>
              <input
                name="q"
                defaultValue={query}
                placeholder="Search email or name…"
                className="admin-search"
              />
              <button type="submit" className="btn-admin primary">Search</button>
              {query && (
                <a href="/admin/users" className="btn-admin">Clear</a>
              )}
            </form>
          </div>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Plan</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Last sign-in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="admin-empty">
                      {query ? `No users matching "${query}"` : 'No users yet'}
                    </div>
                  </td>
                </tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {u.email}
                  </td>
                  <td style={{ color: 'var(--ink-soft)' }}>{u.name ?? '—'}</td>
                  <td>
                    <span className={`plan-tag ${u.plan}`}>{u.plan}</span>
                  </td>
                  <td>
                    {u.is_admin ? <span className="admin-pill">Admin</span> : '—'}
                  </td>
                  <td style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
                    {fmt(u.created_at)}
                  </td>
                  <td style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
                    {fmt(u.last_sign_in_at)}
                  </td>
                  <td>
                    <div className="admin-actions">
                      <a href={`/admin/users/${u.id}`} className="btn-admin">
                        View
                      </a>
                      <button
                        className="btn-admin"
                        title="Change plan"
                        data-user-id={u.id}
                        data-current-plan={u.plan}
                        onClick={undefined}
                      >
                        Plan ↓
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>
              Page {page} — {users.length} of {('total' in (authData ?? {}) ? (authData as { total: number }).total : null) ?? users.length} users
            </span>
            <div className="admin-page-btns">
              {page > 1 && (
                <a
                  href={`/admin/users?page=${page - 1}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                  className="btn-admin"
                >
                  ← Prev
                </a>
              )}
              {users.length === perPage && (
                <a
                  href={`/admin/users?page=${page + 1}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                  className="btn-admin"
                >
                  Next →
                </a>
              )}
            </div>
          </div>
        </div>
      </main>
    </AdminShell>
  )
}
