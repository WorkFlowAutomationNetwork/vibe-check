import { createServiceClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

interface Stats {
  total_users: number
  free_users: number
  starter_users: number
  monitor_users: number
  total_scans: number
  completed_scans: number
  failed_scans: number
  active_scans: number
  total_findings: number
  critical_findings: number
  total_urls: number
  verified_urls: number
}

interface RecentUser {
  id: string
  email: string
  created_at: string
  plan: string
  is_admin: boolean
}

interface RecentScan {
  id: string
  status: string
  grade: string | null
  started_at: string
  scan_type: string
  url: { url: string } | null
}

export default async function AdminDashboardPage() {
  const service = createServiceClient()

  const [statsResult, recentUsersResult, recentScansResult] = await Promise.all([
    service.from('admin_stats').select('*').single(),
    service.auth.admin.listUsers({ page: 1, perPage: 8 }),
    service
      .from('scans')
      .select('id, status, grade, started_at, scan_type, url:urls(url)')
      .order('started_at', { ascending: false })
      .limit(8),
  ])

  const stats: Stats = statsResult.data ?? {
    total_users: 0, free_users: 0, starter_users: 0, monitor_users: 0,
    total_scans: 0, completed_scans: 0, failed_scans: 0, active_scans: 0,
    total_findings: 0, critical_findings: 0, total_urls: 0, verified_urls: 0,
  }

  // Merge auth users with profile data
  const authUsers = recentUsersResult.data?.users ?? []
  const userIds = authUsers.map(u => u.id)
  const { data: profiles } = userIds.length
    ? await service.from('profiles').select('id, plan, is_admin').in('id', userIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  const recentUsers: RecentUser[] = authUsers.map(u => ({
    id: u.id,
    email: u.email ?? '—',
    created_at: u.created_at,
    plan: profileMap.get(u.id)?.plan ?? 'free',
    is_admin: profileMap.get(u.id)?.is_admin ?? false,
  }))

  const recentScans = (recentScansResult.data ?? []) as unknown as RecentScan[]

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  const mrr = stats.starter_users * 9 + stats.monitor_users * 19

  return (
    <AdminShell activeNav="overview">
      <main className="admin-main">
        <div className="admin-topline">
          <div>
            <h1 className="admin-title">Platform Overview</h1>
            <div className="admin-subtitle">Real-time stats across all accounts</div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="admin-stats">
          <div className="admin-stat">
            <div className="admin-stat-label">Total Users</div>
            <div className="admin-stat-value">{stats.total_users}</div>
            <div className="admin-stat-sub">
              {stats.free_users} free · {stats.starter_users} starter · {stats.monitor_users} monitor
            </div>
          </div>
          <div className="admin-stat lime">
            <div className="admin-stat-label">Est. MRR</div>
            <div className="admin-stat-value">${mrr}</div>
            <div className="admin-stat-sub">{stats.starter_users + stats.monitor_users} paying accounts</div>
          </div>
          <div className="admin-stat violet">
            <div className="admin-stat-label">Total Scans</div>
            <div className="admin-stat-value">{stats.total_scans}</div>
            <div className="admin-stat-sub">
              {stats.active_scans} active · {stats.failed_scans} failed
            </div>
          </div>
          <div className="admin-stat danger">
            <div className="admin-stat-label">Critical Findings</div>
            <div className="admin-stat-value">{stats.critical_findings}</div>
            <div className="admin-stat-sub">{stats.total_findings} total findings</div>
          </div>
        </div>

        {/* Second row */}
        <div className="admin-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 0 }}>
          <div className="admin-stat">
            <div className="admin-stat-label">URLs Monitored</div>
            <div className="admin-stat-value">{stats.total_urls}</div>
            <div className="admin-stat-sub">{stats.verified_urls} verified</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-label">Scans Completed</div>
            <div className="admin-stat-value">{stats.completed_scans}</div>
            <div className="admin-stat-sub">
              {stats.total_scans > 0
                ? Math.round((stats.completed_scans / stats.total_scans) * 100)
                : 0}% success rate
            </div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-label">Plan Breakdown</div>
            <div className="admin-stat-value" style={{ fontSize: 18, lineHeight: 1.5, marginTop: 4 }}>
              <span style={{ color: 'var(--ink-mute)' }}>Free</span>{' '}
              <span style={{ color: 'var(--violet)', fontWeight: 700 }}>{stats.free_users}</span>
              {'  ·  '}
              <span style={{ color: 'var(--ink-mute)' }}>/$15</span>{' '}
              <span style={{ color: 'var(--violet)', fontWeight: 700 }}>{stats.starter_users}</span>
              {'  ·  '}
              <span style={{ color: 'var(--ink-mute)' }}>/mo</span>{' '}
              <span style={{ color: 'var(--lime-deep)', fontWeight: 700 }}>{stats.monitor_users}</span>
            </div>
            <div className="admin-stat-sub"> </div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-label">Scans Running</div>
            <div className="admin-stat-value">{stats.active_scans}</div>
            <div className="admin-stat-sub">currently in queue</div>
          </div>
        </div>

        {/* ── RECENT SIGN-UPS ── */}
        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <span className="admin-table-title">Recent Sign-ups</span>
            <a href="/admin/users" className="btn-admin">View all →</a>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Plan</th>
                <th>Role</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-empty">No users yet</td>
                </tr>
              )}
              {recentUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.email}</td>
                  <td><span className={`plan-tag ${u.plan}`}>{u.plan}</span></td>
                  <td>{u.is_admin ? <span className="admin-pill">Admin</span> : '—'}</td>
                  <td style={{ color: 'var(--ink-mute)', fontSize: 12 }}>{fmt(u.created_at)}</td>
                  <td>
                    <a href={`/admin/users/${u.id}`} className="btn-admin">View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── RECENT SCANS ── */}
        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <span className="admin-table-title">Recent Scans</span>
            <a href="/admin/scans" className="btn-admin">View all →</a>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Type</th>
                <th>Status</th>
                <th>Grade</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {recentScans.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-empty">No scans yet</td>
                </tr>
              )}
              {recentScans.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {s.url?.url ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
                    {s.scan_type}
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
                    {s.started_at ? fmt(s.started_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AdminShell>
  )
}
