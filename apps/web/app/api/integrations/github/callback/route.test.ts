import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyState = vi.fn()
const listInstallationRepos = vi.fn()
vi.mock('@/lib/github/app', () => ({ verifyState: (s: string) => verifyState(s), listInstallationRepos: (id: number) => listInstallationRepos(id), STATE_COOKIE_NAME: 'vibe_gh_state' }))

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
  installUpsert.mockResolvedValue({ data: { id: 'inst-row-1' }, error: null })
  reposUpsert.mockResolvedValue({ error: null })
  listInstallationRepos.mockResolvedValue([
    { github_repo_id: 10, full_name: 'me/app', default_branch: 'main' },
  ])
})

describe('GET github callback', () => {
  it('reads state from the httpOnly cookie (GitHub does not echo it), records the installation and syncs repos, then redirects', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555', 'cookie-state-xyz'))
    // state must come from the cookie, NOT the query string
    expect(verifyState).toHaveBeenCalledWith('cookie-state-xyz')
    expect(installUpsert).toHaveBeenCalled()
    expect(reposUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ github_repo_id: 10, full_name: 'me/app' })]),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/integrations')
    // the one-time state cookie is cleared after use
    expect(res.headers.get('set-cookie') ?? '').toContain(`${STATE_COOKIE_NAME}=`)
  })

  it('rejects when there is no state cookie (empty state fails verification)', async () => {
    verifyState.mockReturnValue(null) // real verifyState('') returns null
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555'))
    expect(verifyState).toHaveBeenCalledWith('')
    expect(res.status).toBe(400)
    expect(installUpsert).not.toHaveBeenCalled()
  })

  it('rejects when state does not match the session user', async () => {
    verifyState.mockReturnValue({ userId: 'someone-else' })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555', 'cookie-state-xyz'))
    expect(res.status).toBe(400)
    expect(installUpsert).not.toHaveBeenCalled()
  })

  it('rejects a bad/expired state', async () => {
    verifyState.mockReturnValue(null)
    const { GET } = await import('./route')
    const res = await GET(makeRequest('installation_id=555', 'cookie-state-xyz'))
    expect(res.status).toBe(400)
  })
})
