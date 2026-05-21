import { createServiceClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

interface ScanRow {
  id: string
  scan_type: string
  status: string
  grade: string | null
  started_at: string | null
  completed_at: string | null
  user_id: string
  url: { url: string } | null
}

export default async function AdminScansPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string; type?: string }
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const perPage = 25
  const statusFilter = searchParams.status ?? ''
  const typeFilter = searchParams.type ?? ''

  const service = createServiceClient()

  let q = service
    .from('scans')
    .select('id, scan_type, status, grade, started_at, completed_at, user_id, url:urls(url)', {
      count: 'exact',
    })
    .order('started_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)

  if (statusFilter) q = q.eq('status', statusFilter)
  if (typeFilter) q = q.eq('scan_type', typeFilter)

  const { data, count } = await q

  const scans = (data ?? []) as unknown as ScanRow[]
  const total = count ?? 0

  // Fetch emails for user IDs
  const userIds = Array.from(new Set(scans.map(s => s.user_id)))
  const emailMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: authData } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of authData?.users ?? []) {
      emailMap.set(u.id, u.email ?? u.id.slice(0, 8))
    }
  }

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-AU', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '—'

  const duration = (start: string | null, end: string | null) => {
    if (!start || !end) return '—'
    const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    if (s < 60) return `${s}s`
    return `${Math.round(s / 60)}m ${s % 60}s`
  }

  const filterUrl = (params: Record<string, string>) => {
    const sp = new URLSearchParams({ page: '1', ...params })
    if (statusFilter && !params.status) sp.set('status', statusFilter)
    if (typeFilter && !params.type) sp.set('type', typeFilter)
    return `/admin/scans?${sp}`
  }

  return (
    <AdminShell activeNav="scans">
      <main className="admin-main">
        <div className="admin-topline">
          <div>
            <h1 className="admin-title">Scans</h1>
            <div className="admin-subtitle">
              All scan jobs across all accounts — {total.toLocaleString()} total
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <a
            href="/admin/scans"
            className={`btn-admin${!statusFilter && !typeFilter ? ' primary' : ''}`}
          >
            All
          </a>
          {(['pending', 'running', 'completed', 'failed'] as const).map(s => (
            <a
              key={s}
              href={filterUrl({ status: s })}
              className={`btn-admin${statusFilter === s ? ' primary' : ''}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </a>
          ))}
          <span style={{ margin: '0 4px', color: 'var(--line)' }}>|</span>
          {(['passive', 'active', 'deep'] as const).map(t => (
            <a
              key={t}
              href={filterUrl({ type: t })}
              className={`btn-admin${typeFilter === t ? ' primary' : ''}`}
            >
              {t}
            </a>
          ))}
        </div>

        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <span className="admin-table-title">
              {statusFilter || typeFilter
                ? `Filtered scans${statusFilter ? ` · ${statusFilter}` : ''}${typeFilter ? ` · ${typeFilter}` : ''}`
                : 'All scans'}
            </span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>User</th>
                <th>Type</th>
                <th>Status</th>
                <th>Grade</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {scans.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-empty">No scans match this filter</td>
                </tr>
              )}
              {scans.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {s.url?.url ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
                    <a
                      href={`/admin/users/${s.user_id}`}
                      style={{ color: 'var(--violet)', textDecoration: 'none' }}
                    >
                      {emailMap.get(s.user_id) ?? s.user_id.slice(0, 8)}
                    </a>
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
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
                    {duration(s.started_at, s.completed_at)}
                  </td>
                  <td style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
                    {fmt(s.started_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>
              {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total.toLocaleString()} scans
            </span>
            <div className="admin-page-btns">
              {page > 1 && (
                <a
                  href={`/admin/scans?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ''}${typeFilter ? `&type=${typeFilter}` : ''}`}
                  className="btn-admin"
                >
                  ← Prev
                </a>
              )}
              {page * perPage < total && (
                <a
                  href={`/admin/scans?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ''}${typeFilter ? `&type=${typeFilter}` : ''}`}
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
