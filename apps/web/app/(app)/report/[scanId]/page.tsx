import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import ReportActionsBar from '@/components/report/ReportActionsBar'
import FindingsList from '@/components/report/FindingsList'
import ScanPollingView from '@/components/report/ScanPollingView'
import { createServerClient } from '@/lib/supabase/server'
import type { FindingRow } from '@/types'
import '../../app.css'

interface Props {
  params: { scanId: string }
}

const GRADE_NOTES: Record<string, string> = {
  'A+': 'Excellent — clean bill of health.',
  'A':  'Very strong — minor gaps only.',
  'B+': 'A grade away from a clean public badge.',
  'B':  'Solid. A couple of things worth tightening.',
  'C+': 'Room for improvement — a few issues to address.',
  'C':  'Some real concerns here.',
  'D':  'Several significant issues found.',
  'F':  'Critical issues require immediate attention.',
}

const GRADE_VERDICT: Record<string, [string, string]> = {
  'A+': ['Clean sweep.', 'No meaningful issues found. Keep it up.'],
  'A':  ['Looking good.', 'Minor gaps — worth fixing, but no urgency.'],
  'B+': ["You're not on fire. Yet.", "One critical issue worth fixing today, a few medium issues for the week."],
  'B':  ['Solid foundation.', 'A couple of things worth tightening up.'],
  'C+': ['Work to do.', 'Several issues across different categories. Prioritise the high-severity ones.'],
  'C':  ['Real concerns here.', 'Multiple issues that could be exploited. Start with the critical findings.'],
  'D':  ['Significant issues found.', 'Multiple high-severity problems. Treat this as urgent.'],
  'F':  ['Immediate action needed.', 'Critical vulnerabilities found. Do not ship this without fixes.'],
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}m ${rem}s` : `${s}s`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })
}

export default async function ReportPage({ params }: Props) {
  if (!params.scanId) notFound()

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data: scan } = await supabase
    .from('scans')
    .select('*')
    .eq('id', params.scanId)
    .or(`user_id.eq.${user.id},is_public.eq.true`)
    .single()

  if (!scan) notFound()

  if (scan.status === 'pending' || scan.status === 'running') {
    return (
      <AppShell activeNav="reports">
        <main className="app-main">
          <Link href="/dashboard" className="back-link">← back to dashboard</Link>
          <ScanPollingView scanId={scan.id} />
        </main>
      </AppShell>
    )
  }

  const [{ data: urlRow }, { data: findings }] = await Promise.all([
    supabase.from('urls').select('url').eq('id', scan.url_id).single(),
    supabase.from('findings').select('*').eq('scan_id', scan.id),
  ])

  const typedFindings: FindingRow[] = findings ?? []
  const grade = scan.grade ?? '—'
  const gradeNote = GRADE_NOTES[grade] ?? ''
  const [verdict, verdictSub] = GRADE_VERDICT[grade] ?? ['Scan complete.', '']

  const counts = {
    critical: typedFindings.filter(f => f.severity === 'critical').length,
    medium:   typedFindings.filter(f => f.severity === 'medium').length,
    low:      typedFindings.filter(f => f.severity === 'low').length,
    pass:     typedFindings.filter(f => f.severity === 'pass').length,
  }

  const displayUrl = urlRow?.url ?? params.scanId
  const cleanUrl = displayUrl.replace(/^https?:\/\//, '')

  return (
    <AppShell activeNav="reports">
      <main className="app-main">
        <Link href="/dashboard" className="back-link">← back to dashboard</Link>

        <div className="report-top">
          <div>
            <h1 className="report-title">
              <span className="prefix">https://</span>{cleanUrl}
            </h1>
            <div className="report-meta">
              <span>scan id <b>{scan.id.slice(0, 8)}</b></span>
              <span>completed <b>{formatDate(scan.completed_at)}</b></span>
              <span>mode <b>{scan.scan_type}</b></span>
              {scan.checks_total && <span>checks <b>{scan.checks_total}</b></span>}
            </div>
          </div>
          <ReportActionsBar scanId={params.scanId} />
        </div>

        {scan.status === 'failed' ? (
          <div style={{ background: '#fef2f2', border: '1.5px solid var(--danger)', borderRadius: 'var(--radius)', padding: '24px 28px', marginBottom: 24 }}>
            <h2 style={{ color: 'var(--danger)', margin: '0 0 8px' }}>Scan failed</h2>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>This scan encountered an error and could not complete. Please try running a new scan from the dashboard.</p>
          </div>
        ) : (
          <>
            <div className="grade-card">
              <div className="grade-big">
                <div className="gnum">{grade}</div>
                <div className="gnote">{gradeNote}</div>
              </div>
              <div className="grade-body">
                <p className="verdict">{verdict}</p>
                <p className="verdict-sub">{verdictSub}</p>
              </div>
              <div className="grade-summary">
                {counts.critical > 0 && <div className="gs-row crit"><div className="swatch" /><div className="n">{counts.critical}</div> critical · fix today</div>}
                {counts.medium > 0 && <div className="gs-row med"><div className="swatch" /><div className="n">{counts.medium}</div> medium · this week</div>}
                {counts.pass > 0 && <div className="gs-row pass"><div className="swatch" /><div className="n">{counts.pass}</div> passed clean</div>}
                {typedFindings.length === 0 && <div style={{ color: 'var(--ink-mute)', fontSize: 13 }}>No findings recorded.</div>}
              </div>
            </div>

            <FindingsList findings={typedFindings} />
          </>
        )}
      </main>
    </AppShell>
  )
}
