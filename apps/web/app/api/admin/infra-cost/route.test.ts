import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUser = vi.fn()
const isAdminSingle = vi.fn()
const fetchMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: isAdminSingle }) }) }),
  }),
}))

vi.stubGlobal('fetch', fetchMock)

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  isAdminSingle.mockResolvedValue({ data: { is_admin: true } })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/admin/infra-cost', () => {
  it('returns 403 for a non-admin caller', async () => {
    isAdminSingle.mockResolvedValue({ data: { is_admin: false } })
    expect((await GET()).status).toBe(403)
  })

  it('returns live:false with static services when FLY_API_TOKEN is unset', async () => {
    vi.stubEnv('FLY_API_TOKEN', '')
    const res = await GET()
    const body = await res.json()
    expect(body.live).toBe(false)
    expect(body.reason).toContain('FLY_API_TOKEN')
    expect(body.staticServices.length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns live:true with a Fly estimate when the token is set', async () => {
    vi.stubEnv('FLY_API_TOKEN', 'fly_token')
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/machines')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'm1', state: 'started', config: { guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 2048 } } },
          ]),
        })
      }
      // graphql billing
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { viewer: { organizations: { nodes: [{ name: 'wfan', slug: 'wfan', creditBalance: 0, billingStatus: 'active' }] } } } }),
      })
    })
    const res = await GET()
    const body = await res.json()
    expect(body.live).toBe(true)
    expect(body.flyApps[0].name).toBe('vibe-check-scanner')
    expect(body.flyTotal).toBeGreaterThan(0)
    expect(body.billing.orgSlug).toBe('wfan')
  })
})
