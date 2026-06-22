import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/github/app', () => ({
  signState: () => 'signed-state',
  buildInstallUrl: (s: string) => `https://github.com/apps/vibe-check/installations/new?state=${s}`,
  STATE_COOKIE_NAME: 'vibe_gh_state',
  STATE_COOKIE_MAX_AGE: 600,
}))

beforeEach(() => vi.clearAllMocks())

describe('GET /api/integrations/github/install', () => {
  it('redirects an authed user to the install URL', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('installations/new?state=signed-state')
    // state is stashed in an httpOnly cookie for the callback to read back
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('vibe_gh_state=signed-state')
    expect(setCookie.toLowerCase()).toContain('httponly')
  })

  it('401s an unauthenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
