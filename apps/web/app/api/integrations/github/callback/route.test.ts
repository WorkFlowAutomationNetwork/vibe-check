import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyState = vi.fn()
const listInstallationRepos = vi.fn()
vi.mock('@/lib/github/app', () => ({ verifyState: (s: string) => verifyState(s), listInstallationRepos: (id: number) => listInstallationRepos(id) }))

const installUpsert = vi.fn()
const reposUpsert = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'github_installations') {
        return { upsert: () => ({ select: () => ({ single: () => installUpsert() }) }) }
      }
      return { upsert: (rows: unknown) => reposUpsert(rows) }
    },
  }),
}))

function makeRequest(qs: string) {
  return new Request(`https://app.test/api/integrations/github/callback?${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  verifyState.mockReturnValue({ userId: 'user-1' })
  installUpsert.mockResolvedValue({ data: { id: 'inst-row-1' }, error: null })
  reposUpsert.mockResolvedValue({ error: null })
  listInstallationRepos.mockResolvedValue([
    { github_repo_id: 10, full_name: 'me/app', default_branch: 'main' },
  ])
})

describe('GET github callback', () => {
  it('records the installation and syncs repos, then redirects', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555&state=abc'))
    expect(installUpsert).toHaveBeenCalled()
    expect(reposUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ github_repo_id: 10, full_name: 'me/app' })]),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/integrations')
  })

  it('rejects when state does not match the session user', async () => {
    verifyState.mockReturnValue({ userId: 'someone-else' })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555&state=abc'))
    expect(res.status).toBe(400)
    expect(installUpsert).not.toHaveBeenCalled()
  })

  it('rejects a bad/expired state', async () => {
    verifyState.mockReturnValue(null)
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555&state=abc'))
    expect(res.status).toBe(400)
  })
})
