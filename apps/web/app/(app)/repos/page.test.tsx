import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state: any = {}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => state.client }))
vi.mock('@/components/shared/AppShell', () => ({ default: ({ children }: any) => <div>{children}</div> }))
vi.mock('@/components/repos/ScanRepoButton', () => ({ default: () => <button>Scan now</button> }))
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import ReposPage from './page'

function makeClient(installation: any, repos: any[] = [], scans: any[] = []) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => {
      if (t === 'github_installations') return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: installation }) }) }) }),
      }
      if (t === 'repos') return {
        select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ data: repos }) }) }) }),
      }
      if (t === 'repo_scans') return {
        select: () => ({ eq: () => ({ order: () => ({ data: scans }) }) }),
      }
      throw new Error('unexpected table ' + t)
    },
  }
}

beforeEach(() => { state.client = null })

describe('/repos list page', () => {
  it('shows a Connect CTA when GitHub is not connected', async () => {
    state.client = makeClient(null)
    const html = renderToStaticMarkup(await ReposPage())
    expect(html).toContain('Connect GitHub')
    expect(html).toContain('/api/integrations/github/install')
  })

  it('shows a manage-access state when connected with no repos', async () => {
    state.client = makeClient({ installation_id: 1, account_login: 'me', status: 'active' }, [])
    const html = renderToStaticMarkup(await ReposPage())
    expect(html).toContain('No repositories selected')
  })

  it('renders a row per repo with the status pill from its latest scan', async () => {
    state.client = makeClient(
      { installation_id: 1, account_login: 'me', status: 'active' },
      [{ id: 'r1', full_name: 'me/app', last_scan_at: null }],
      [{ id: 's1', repo_id: 'r1', status: 'completed', mode: 'full', secrets_found: 0, created_at: '2026-06-21T00:00:00Z' }],
    )
    const html = renderToStaticMarkup(await ReposPage())
    expect(html).toContain('me/app')
    expect(html).toContain('Clean')
    expect(html).toContain('/repos/r1')
  })
})
