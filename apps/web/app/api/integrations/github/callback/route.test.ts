import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyState = vi.fn()
const exchangeCodeForUserToken = vi.fn()
const listUserInstallations = vi.fn()
const listInstallationRepos = vi.fn()
const buildInstallUrl = vi.fn()
vi.mock('@/lib/github/app', () => ({
  verifyState: (s: string) => verifyState(s),
  exchangeCodeForUserToken: (c: string) => exchangeCodeForUserToken(c),
  listUserInstallations: (t: string) => listUserInstallations(t),
  listInstallationRepos: (id: number) => listInstallationRepos(id),
  buildInstallUrl: (s: string) => buildInstallUrl(s),
  signState: () => 'fresh-state',
  STATE_COOKIE_NAME: 'vibe_gh_state',
  STATE_COOKIE_MAX_AGE: 600,
}))

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

const STATE_COOKIE_NAME = 'vibe_gh_state'

function makeRequest(qs: string, stateCookie?: string) {
  const headers = new Headers()
  if (stateCookie !== undefined) {
    headers.set('cookie', `${STATE_COOKIE_NAME}=${encodeURIComponent(stateCookie)}`)
  }
  return new Request(`https://app.test/api/integrations/github/callback?${qs}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  verifyState.mockReturnValue({ userId: 'user-1' })
  exchangeCodeForUserToken.mockResolvedValue('user-token')
  listUserInstallations.mockResolvedValue([
    { installation_id: 555, account_login: 'me', account_type: 'User' },
  ])
  installUpsert.mockResolvedValue({ data: { id: 'inst-row-1' }, error: null })
  reposUpsert.mockResolvedValue({ error: null })
  listInstallationRepos.mockResolvedValue([
    { github_repo_id: 10, full_name: 'me/app', default_branch: 'main' },
  ])
  buildInstallUrl.mockReturnValue('https://github.com/apps/vibe-check/installations/new?state=fresh-state')
})

describe('GET github callback', () => {
  it('exchanges the code, reads state from the cookie, records the installation + repos, then redirects', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeRequest('code=oauth-code', 'cookie-state-xyz'))
    // state from cookie, code from query
    expect(verifyState).toHaveBeenCalledWith('cookie-state-xyz')
    expect(exchangeCodeForUserToken).toHaveBeenCalledWith('oauth-code')
    expect(listUserInstallations).toHaveBeenCalledWith('user-token')
    expect(installUpsert).toHaveBeenCalled()
    expect(listInstallationRepos).toHaveBeenCalledWith(555)
    expect(reposUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ github_repo_id: 10, full_name: 'me/app' })]),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/integrations')
    expect(res.headers.get('set-cookie') ?? '').toContain(`${STATE_COOKIE_NAME}=`)
  })

  it('sends the user to install when they have authorized but not installed on any repo', async () => {
    listUserInstallations.mockResolvedValue([])
    const { GET } = await import('./route')
    const res = await GET(makeRequest('code=oauth-code', 'cookie-state-xyz'))
    expect(installUpsert).not.toHaveBeenCalled()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('installations/new')
  })

  it('rejects when there is no code', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeRequest('', 'cookie-state-xyz'))
    expect(res.status).toBe(400)
    expect(exchangeCodeForUserToken).not.toHaveBeenCalled()
  })

  it('rejects when there is no state cookie (empty state fails verification)', async () => {
    verifyState.mockReturnValue(null)
    const { GET } = await import('./route')
    const res = await GET(makeRequest('code=oauth-code'))
    expect(verifyState).toHaveBeenCalledWith('')
    expect(res.status).toBe(400)
    expect(exchangeCodeForUserToken).not.toHaveBeenCalled()
  })

  it('rejects when state does not match the session user', async () => {
    verifyState.mockReturnValue({ userId: 'someone-else' })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('code=oauth-code', 'cookie-state-xyz'))
    expect(res.status).toBe(400)
    expect(installUpsert).not.toHaveBeenCalled()
  })

  it('rejects a bad/expired state', async () => {
    verifyState.mockReturnValue(null)
    const { GET } = await import('./route')
    const res = await GET(makeRequest('code=oauth-code', 'cookie-state-xyz'))
    expect(res.status).toBe(400)
  })
})
