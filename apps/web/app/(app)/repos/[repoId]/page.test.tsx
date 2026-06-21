import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state: any = {}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => state.client }))
vi.mock('@/components/shared/AppShell', () => ({ default: ({ children }: any) => <div>{children}</div> }))
vi.mock('@/components/repos/ScanRepoButton', () => ({ default: () => <button>Scan now</button> }))
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import RepoReportPage from './page'

function makeClient({ repo, scans = [], findings = [] }: any) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => {
      if (t === 'repos') return {
        select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: repo }) }) }) }),
      }
      if (t === 'repo_scans') return {
        select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ data: scans }) }) }) }),
      }
      if (t === 'repo_findings') return {
        select: () => ({ eq: () => ({ eq: () => ({ data: findings }) }) }),
      }
      throw new Error('unexpected table ' + t)
    },
  }
}

const REPO = { id: 'r1', full_name: 'me/app', status: 'active', installation_id: 'i1' }
beforeEach(() => { state.client = null })

describe('/repos/[repoId] report page', () => {
  it('notFound when the repo does not belong to the user', async () => {
    state.client = makeClient({ repo: null })
    await expect(RepoReportPage({ params: { repoId: 'r1' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows the Clean headline when the latest completed scan found zero secrets', async () => {
    state.client = makeClient({
      repo: REPO,
      scans: [{ id: 's1', status: 'completed', mode: 'full', commits_scanned: 120, secrets_found: 0, started_at: null, completed_at: '2026-06-21T00:00:00Z', created_at: '2026-06-21T00:00:00Z', error: null }],
    })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('Clean')
    expect(html).toContain('Full history')
  })

  it('shows the exposed headline and grouped findings when secrets are found', async () => {
    state.client = makeClient({
      repo: REPO,
      scans: [{ id: 's2', status: 'completed', mode: 'incremental', commits_scanned: 4, secrets_found: 2, started_at: null, completed_at: '2026-06-21T00:00:00Z', created_at: '2026-06-21T00:00:00Z', error: null }],
      findings: [
        { id: 'f1', rule_id: 'stripe-access-token', severity: 'critical', title: 'Stripe secret key', description: null, file_path: 'src/x.ts', commit_sha: 'abcdef1234', line_start: 12, match_preview: 'sk_live_abc…7f9x', commit_author: 'me', committed_at: '2026-06-01T00:00:00Z', remediation: 'Rotate it.' },
        { id: 'f2', rule_id: 'generic-api-key', severity: 'medium', title: 'Generic API key', description: null, file_path: '.env', commit_sha: 'beef0001', line_start: 3, match_preview: 'AKIA…', commit_author: null, committed_at: null, remediation: 'Remove it.' },
      ],
    })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('2 secrets exposed')
    expect(html).toContain('Incremental')
    expect(html).toContain('Stripe secret key')
    expect(html).toContain('Generic API key')
    expect(html).toContain('Critical')
    expect(html).toContain('Medium')
  })

  it('shows a failed panel when the latest scan failed and none completed', async () => {
    state.client = makeClient({
      repo: REPO,
      scans: [{ id: 's3', status: 'failed', mode: 'full', commits_scanned: null, secrets_found: null, started_at: null, completed_at: null, created_at: '2026-06-21T00:00:00Z', error: 'boom' }],
    })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('Scan failed')
  })

  it('shows an empty state when the repo has never been scanned', async () => {
    state.client = makeClient({ repo: REPO, scans: [] })
    const html = renderToStaticMarkup(await RepoReportPage({ params: { repoId: 'r1' } }))
    expect(html).toContain('been scanned')
  })
})
