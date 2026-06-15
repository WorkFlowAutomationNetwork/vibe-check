import { createServiceClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'

interface ScanRow {
  id: string
  status: string
  grade: string | null
  created_at: string
  url_id: string
}

interface FindingRow {
  severity: string
  category: string
}

interface UrlScanCount {
  url: string
  count: number
}

const GRADE_ORDER = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F']

function gradeScore(grade: string | null): number {
  if (!grade) return -1
  return GRADE_ORDER.length - GRADE_ORDER.indexOf(grade)
}

function weekLabel(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default async function AdminAnalyticsPage() {
  const service = createServiceClient()

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const [scansResult, findingsResult, urlsResult] = await Promise.all([
    service
      .from('scans')
      .select('id, status, grade, created_at, url_id')
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: true }),
    service
      .from('findings')
      .select('severity, category'),
    service
      .from('urls')
      .select('id, url'),
  ])

  const scans: ScanRow[] = (scansResult.data ?? []) as ScanRow[]
  const findings: FindingRow[] = (findingsResult.data ?? []) as FindingRow[]
  const urls = urlsResult.data ?? []

  const urlMap = new Map(urls.map(u => [u.id, u.url as string]))

  // Scans per week (last 12 weeks)
  const weekBuckets = new Map<string, number>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    weekBuckets.set(weekLabel(d), 0)
  }
  for (const scan of scans) {
    const d = new Date(scan.created_at)
    // find which week bucket it falls in (closest Monday)
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    const weekIdx = Math.floor(diffDays / 7)
    if (weekIdx < 12) {
      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() - weekIdx * 7)
      const label = weekLabel(targetDate)
      weekBuckets.set(label, (weekBuckets.get(label) ?? 0) + 1)
    }
  }
  const weekData = Array.from(weekBuckets.entries())
  const maxWeekCount = Math.max(...weekData.map(([, c]) => c), 1)

  // Finding severity breakdown
  const severityCount: Record<string, number> = { critical: 0, medium: 0, low: 0, info: 0, pass: 0 }
  for (const f of findings) {
    if (f.severity in severityCount) severityCount[f.severity]++
  }

  // Finding category breakdown
  const categoryCount: Record<string, number> = {}
  for (const f of findings) {
    categoryCount[f.category] = (categoryCount[f.category] ?? 0) + 1
  }
  const topCategories = Object.entries(categoryCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
  const maxCategoryCount = Math.max(...topCategories.map(([, c]) => c), 1)

  // Grade distribution (completed scans only)
  const gradeCount: Record<string, number> = {}
  for (const scan of scans) {
    if (scan.status === 'completed' && scan.grade) {
      gradeCount[scan.grade] = (gradeCount[scan.grade] ?? 0) + 1
    }
  }
  const gradeEntries = GRADE_ORDER.filter(g => gradeCount[g]).map(g => [g, gradeCount[g]] as [string, number])

  // Top URLs by scan count (all time)
  const urlScanCount = new Map<string, number>()
  for (const scan of scans) {
    urlScanCount.set(scan.url_id, (urlScanCount.get(scan.url_id) ?? 0) + 1)
  }
  const topUrls: UrlScanCount[] = Array.from(urlScanCount.entries())
    .map(([id, count]) => ({ url: urlMap.get(id) ?? id.slice(0, 8) + '…', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Overall stats
  const completedScans = scans.filter(s => s.status === 'completed').length
  const failedScans = scans.filter(s => s.status === 'failed').length
  const totalFindings = findings.length
  const criticalFindings = findings.filter(f => f.severity === 'critical').length

  const SEV_COLORS: Record<string, string> = {
    critical: 'var(--danger)',
    medium: 'var(--warn)',
    low: 'var(--violet)',
    info: 'var(--ink-mute)',
    pass: 'var(--lime-deep)',
  }

  return (
    <AdminShell activeNav="analytics">
      <main className="admin-main">
        <div className="admin-topline">
          <div>
            <h1 className="admin-title">Analytics</h1>
            <div className="admin-subtitle">Usage trends and scan intelligence — last 90 days</div>
          </div>
        </div>

        {/* Top stats */}
        <div className="admin-stats">
          <div className="admin-stat">
            <div className="admin-stat-label">Scans (90d)</div>
            <div className="admin-stat-value">{scans.length}</div>
            <div className="admin-stat-sub">{completedScans} completed · {failedScans} failed</div>
          </div>
          <div className="admin-stat danger">
            <div className="admin-stat-label">Critical Findings</div>
            <div className="admin-stat-value">{criticalFindings}</div>
            <div className="admin-stat-sub">{totalFindings} total findings</div>
          </div>
          <div className="admin-stat lime">
            <div className="admin-stat-label">URLs Scanned</div>
            <div className="admin-stat-value">{urlScanCount.size}</div>
            <div className="admin-stat-sub">unique URLs in period</div>
          </div>
          <div className="admin-stat violet">
            <div className="admin-stat-label">Pass Rate</div>
            <div className="admin-stat-value">
              {totalFindings > 0
                ? Math.round((severityCount.pass / totalFindings) * 100)
                : 0}%
            </div>
            <div className="admin-stat-sub">findings that passed checks</div>
          </div>
        </div>

        {/* Scan volume over time */}
        <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
          <div className="admin-table-head">
            <span className="admin-table-title">Scan Volume — Last 12 Weeks</span>
          </div>
          <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
            {weekData.map(([label, count]) => (
              <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {count > 0 ? count : ''}
                </div>
                <div
                  style={{
                    width: '100%',
                    background: count > 0 ? 'var(--violet)' : 'var(--line)',
                    height: Math.max(4, Math.round((count / maxWeekCount) * 88)),
                    borderRadius: 2,
                  }}
                />
                <div style={{ fontSize: 9, color: 'var(--ink-mute)', textAlign: 'center', lineHeight: 1.2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Severity breakdown */}
          <div className="admin-table-wrap" style={{ marginBottom: 0 }}>
            <div className="admin-table-head">
              <span className="admin-table-title">Finding Severity Breakdown</span>
            </div>
            <div style={{ padding: '16px 24px 20px' }}>
              {Object.entries(severityCount).map(([sev, count]) => (
                <div key={sev} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{sev}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{count}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-sub)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${totalFindings > 0 ? (count / totalFindings) * 100 : 0}%`,
                        background: SEV_COLORS[sev] ?? 'var(--ink-mute)',
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grade distribution */}
          <div className="admin-table-wrap" style={{ marginBottom: 0 }}>
            <div className="admin-table-head">
              <span className="admin-table-title">Grade Distribution</span>
            </div>
            <div style={{ padding: '16px 24px 20px' }}>
              {gradeEntries.length === 0 && (
                <div style={{ color: 'var(--ink-mute)', fontSize: 13, paddingTop: 8 }}>No completed scans yet</div>
              )}
              {gradeEntries.map(([grade, count]) => {
                const total = Object.values(gradeCount).reduce((a, b) => a + b, 0)
                return (
                  <div key={grade} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{grade}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-mute)' }}>
                        {count} ({Math.round((count / total) * 100)}%)
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-sub)', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(count / total) * 100}%`,
                          background: gradeScore(grade) >= 6 ? 'var(--lime-deep)' : gradeScore(grade) >= 4 ? 'var(--warn)' : 'var(--danger)',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Top categories */}
        <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
          <div className="admin-table-head">
            <span className="admin-table-title">Top Finding Categories</span>
          </div>
          <div style={{ padding: '16px 24px 20px' }}>
            {topCategories.map(([cat, count]) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>{cat}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{count}</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-sub)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(count / maxCategoryCount) * 100}%`,
                      background: 'var(--violet)',
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top URLs by scan count */}
        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <span className="admin-table-title">Most Scanned URLs (90d)</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>URL</th>
                <th>Scans</th>
              </tr>
            </thead>
            <tbody>
              {topUrls.length === 0 && (
                <tr>
                  <td colSpan={3} className="admin-empty">No scan data yet</td>
                </tr>
              )}
              {topUrls.map((row, i) => (
                <tr key={row.url}>
                  <td style={{ color: 'var(--ink-mute)', fontSize: 12, width: 32 }}>{i + 1}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.url}</td>
                  <td>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--violet)',
                    }}>
                      {row.count}
                    </span>
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
