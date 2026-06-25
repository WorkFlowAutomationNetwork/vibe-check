import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import ScanRepoButton from '@/components/repos/ScanRepoButton'
import { createServerClient } from '@/lib/supabase/server'
import '../../app.css'

interface Props { params: { repoId: string } }

interface RepoScan {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  mode: 'full' | 'incremental'
  commits_scanned: number | null
  secrets_found: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  error: string | null
}

interface RepoFinding {
  id: string
  rule_id: string
  severity: 'critical' | 'medium' | 'low' | 'info'
  title: string
  description: string | null
  file_path: string | null
  commit_sha: string | null
  line_start: number | null
  match_preview: string | null
  variable_name: string | null
  still_live: boolean
  commit_author: string | null
  committed_at: string | null
  remediation: string | null
}

const SEV_ORDER: RepoFinding['severity'][] = ['critical', 'medium', 'low', 'info']
const SEV_LABEL: Record<RepoFinding['severity'], string> = { critical: 'Critical', medium: 'Medium', low: 'Low', info: 'Info' }
const SEV_COLOR: Record<RepoFinding['severity'], string> = { critical: 'var(--danger)', medium: 'var(--warn)', low: 'var(--ink-mute)', info: 'var(--ink-mute)' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const PANEL: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1.5px solid var(--line)',
  borderRadius: 'var(--radius)', padding: '28px 32px', marginBottom: 24,
}

export default async function RepoReportPage({ params }: Props) {
  if (!params.repoId) notFound()

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: repo } = await supabase
    .from('repos')
    .select('id, full_name, status, installation_id')
    .eq('id', params.repoId)
    .eq('user_id', user.id)
    .single()

  if (!repo || repo.status !== 'active') notFound()

  const { data: scans } = await supabase
    .from('repo_scans')
    .select('id, status, mode, commits_scanned, secrets_found, started_at, completed_at, created_at, error')
    .eq('repo_id', params.repoId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const history = (scans ?? []) as RepoScan[]
  const latest = history[0] ?? null
  const completed = history.filter(s => s.status === 'completed')
  const latestCompleted = completed[0] ?? null
  const prevCompleted = completed[1] ?? null
  const inflight = latest && (latest.status === 'pending' || latest.status === 'running') ? latest.id : undefined

  const { data: findingsData } = latestCompleted
    ? await supabase
        .from('repo_findings')
        .select('id, rule_id, severity, title, description, file_path, commit_sha, line_start, match_preview, variable_name, still_live, commit_author, committed_at, remediation')
        .eq('repo_scan_id', latestCompleted.id)
        .eq('user_id', user.id)
    : { data: [] }

  const findings = (findingsData ?? []) as RepoFinding[]
  const secretsFound = latestCompleted?.secrets_found ?? 0

  return (
    <AppShell activeNav="repos">
      <main className="app-main">
        <Link href="/repos" className="back-link">← back to repositories</Link>

        <div className="report-top">
          <div>
            <h1 className="report-title">{repo.full_name}</h1>
            <div className="report-meta">
              {latest && <span>last scan <b>{formatDate(latest.created_at)}</b></span>}
            </div>
          </div>
          <ScanRepoButton repoId={repo.id} activeScanId={inflight} />
        </div>

        {!latest && (
          <div style={PANEL}>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
              This repository hasn&rsquo;t been scanned yet. Run a scan to check its git history for committed secrets.
            </p>
          </div>
        )}

        {latest && (latest.status === 'pending' || latest.status === 'running') && !latestCompleted && (
          <div style={PANEL}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)' }}>Scanning…</h2>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Checking the full git history — this usually takes under a minute.</p>
          </div>
        )}

        {latest && latest.status === 'failed' && !latestCompleted && (
          <div style={{ ...PANEL, background: '#fef2f2', border: '1.5px solid var(--danger)' }}>
            <h2 style={{ color: 'var(--danger)', margin: '0 0 8px' }}>Scan failed</h2>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>This scan could not complete. Please run it again.</p>
          </div>
        )}

        {latestCompleted && (
          <>
            {secretsFound === 0 ? (
              <div style={{ ...PANEL, border: '1.5px solid var(--lime-deep)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, color: 'var(--lime-deep)' }}>Clean</div>
                <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)' }}>
                  No committed secrets found in {latestCompleted.mode === 'full' ? 'the full git history' : 'the scanned commits'}.
                </p>
              </div>
            ) : (
              <div style={{ ...PANEL, border: '1.5px solid var(--danger)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: 'var(--danger)' }}>
                  {secretsFound} secret{secretsFound === 1 ? '' : 's'} exposed
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {SEV_ORDER.map(sev => {
                    const c = findings.filter(f => f.severity === sev).length
                    return c > 0 ? <span key={sev} style={{ color: SEV_COLOR[sev] }}><b>{c}</b> {SEV_LABEL[sev].toLowerCase()}</span> : null
                  })}
                </div>
              </div>
            )}

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginBottom: 24 }}>
              {latestCompleted.mode === 'full'
                ? 'Full history'
                : `Incremental — ${latestCompleted.commits_scanned ?? 0} new commit${latestCompleted.commits_scanned === 1 ? '' : 's'}${prevCompleted ? ` since ${formatDate(prevCompleted.completed_at)}` : ''}`}
            </div>

            {findings.length > 0 && SEV_ORDER.map(sev => {
              const group = findings.filter(f => f.severity === sev)
              if (group.length === 0) return null
              return (
                <div key={sev}>
                  <h2 className="section-label" style={{ color: SEV_COLOR[sev] }}>{SEV_LABEL[sev]} ({group.length})</h2>
                  {group.map(f => (
                    <div key={f.id} style={{ background: 'var(--bg-card)', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {f.title}{' '}
                        <span style={{ color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.rule_id}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)',
                          color: f.still_live ? 'var(--danger)' : 'var(--ink-mute)',
                          border: `1px solid ${f.still_live ? 'var(--danger)' : 'var(--line)'}`,
                        }}>
                          {f.still_live ? 'still in latest code' : 'history only'}
                        </span>
                      </div>
                      {f.variable_name && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginTop: 6 }}>
                          var: <b>{f.variable_name}</b>
                        </div>
                      )}
                      {f.match_preview && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, margin: '8px 0', color: 'var(--ink-soft)' }}>{f.match_preview}</div>
                      )}
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
                        {f.file_path}{f.line_start != null ? `:${f.line_start}` : ''}
                        {f.commit_sha ? ` · ${f.commit_sha.slice(0, 7)}` : ''}
                        {f.commit_author ? ` · ${f.commit_author}` : ''}
                        {f.committed_at ? ` · ${formatDate(f.committed_at)}` : ''}
                      </div>
                      {f.remediation && (
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>{f.remediation}</div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}

        {history.length > 0 && (
          <>
            <h2 className="section-label" style={{ marginTop: 36 }}>Scan history</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  <th style={{ padding: '8px 0' }}>Date</th>
                  <th>Mode</th>
                  <th>Commits</th>
                  <th>Secrets</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 0' }}>{formatDate(s.created_at)}</td>
                    <td>{s.mode}</td>
                    <td>{s.commits_scanned ?? '—'}</td>
                    <td>{s.secrets_found ?? '—'}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
    </AppShell>
  )
}
