import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import RepoStatusPill from '@/components/repos/RepoStatusPill'
import ScanRepoButton from '@/components/repos/ScanRepoButton'
import { createServerClient } from '@/lib/supabase/server'
import '../app.css'

interface RepoScanLite {
  id: string
  repo_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  mode: 'full' | 'incremental'
  secrets_found: number | null
  created_at: string
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const EMPTY_CARD: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1.5px solid var(--line)',
  borderRadius: 'var(--radius)',
  boxShadow: '6px 6px 0 var(--ink)',
  padding: '40px 32px',
  textAlign: 'center',
  maxWidth: 520,
}

export default async function ReposPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: installation } = await supabase
    .from('github_installations')
    .select('installation_id, account_login, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!installation) {
    return (
      <AppShell activeNav="repos">
        <main className="app-main">
          <div className="topline">
            <div>
              <h1 className="greeting">Repositories</h1>
              <div className="greeting-sub">scan your git history for committed secrets</div>
            </div>
          </div>
          <div style={EMPTY_CARD}>
            <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>Connect GitHub to scan your repositories</h2>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Connect GitHub to check your repositories&rsquo; git history for committed secrets — API keys, .env values, and tokens.
            </p>
            <a className="btn btn-primary" href="/api/integrations/github/install" style={{ padding: '10px 20px' }}>Connect GitHub</a>
          </div>
        </main>
      </AppShell>
    )
  }

  const { data: repos } = await supabase
    .from('repos')
    .select('id, full_name, last_scan_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('full_name')

  const { data: scans } = await supabase
    .from('repo_scans')
    .select('id, repo_id, status, mode, secrets_found, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const latestByRepo = new Map<string, RepoScanLite>()
  for (const s of (scans ?? []) as RepoScanLite[]) {
    if (!latestByRepo.has(s.repo_id)) latestByRepo.set(s.repo_id, s)
  }
  const repoList = repos ?? []

  return (
    <AppShell activeNav="repos">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Repositories</h1>
            <div className="greeting-sub">connected via github.com/{installation.account_login}</div>
          </div>
        </div>

        {repoList.length === 0 ? (
          <div style={EMPTY_CARD}>
            <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>No repositories selected</h2>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Choose which repositories Vibe-Check can scan from your GitHub settings.
            </p>
            <a className="btn btn-soft" href="/api/integrations/github/install" style={{ padding: '10px 20px' }}>Manage access</a>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {repoList.map(repo => {
              const latest = latestByRepo.get(repo.id) ?? null
              const inflight = latest && (latest.status === 'pending' || latest.status === 'running') ? latest.id : undefined
              return (
                <div key={repo.id} style={{
                  background: 'var(--bg-card)', border: '1.5px solid var(--line)',
                  borderRadius: 'var(--radius)', padding: '18px 22px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Link href={`/repos/${repo.id}`} style={{ fontWeight: 600, fontSize: 15 }}>{repo.full_name}</Link>
                      <RepoStatusPill scan={latest} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
                      last scan {formatRelative(repo.last_scan_at)}
                      {latest && ` · ${latest.mode === 'full' ? 'full history' : 'incremental'}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Link href={`/repos/${repo.id}`} className="btn btn-soft" style={{ padding: '8px 14px', fontSize: 13 }}>View report</Link>
                    <ScanRepoButton repoId={repo.id} activeScanId={inflight} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AppShell>
  )
}
