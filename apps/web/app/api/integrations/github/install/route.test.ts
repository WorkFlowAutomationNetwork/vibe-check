import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const entitlementsSingle = vi.fn().mockResolvedValue({ data: { can_integrations: true } })
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ single: entitlementsSingle }) }),
  }),
}))
vi.mock('@/lib/github/app', () => ({
  signState: () => 'signed-state',
  buildAuthorizeUrl: (s: string) => `https://github.com/login/oauth/authorize?client_id=Iv1.x&state=${s}`,
  STATE_COOKIE_NAME: 'vibe_gh_state',
  STATE_COOKIE_MAX_AGE: 600,
}))

beforeEach(() => vi.clearAllMocks())

describe('GET /api/integrations/github/install', () => {
  it('redirects an authed user to the OAuth authorize URL', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('login/oauth/authorize?client_id=Iv1.x&state=signed-state')
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

  it('redirects to billing instead of GitHub when the plan has no integrations', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    entitlementsSingle.mockResolvedValueOnce({ data: { can_integrations: false } })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/billing?error=requires_monitor')
  })
})
