import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const instEq2 = vi.fn().mockResolvedValue({ error: null })
const instUpdate = vi.fn(() => ({ eq: () => ({ eq: () => instEq2() }) }))
const repoEq2 = vi.fn().mockResolvedValue({ error: null })
const repoUpdate = vi.fn(() => ({ eq: () => ({ eq: () => repoEq2() }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: (t: string) => (t === 'github_installations' ? { update: instUpdate } : { update: repoUpdate }),
  }),
}))

function post(body: object) {
  return new Request('https://app.test/api/integrations/github/disconnect', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('POST github disconnect', () => {
  it('revokes the installation and removes its repos', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ installation_id: 42 }))
    expect(res.status).toBe(200)
    expect(instUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
    expect(repoUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }))
  })

  it('422s on a missing installation_id', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({}))
    expect(res.status).toBe(422)
  })

  it('401s when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('./route')
    const res = await POST(post({ installation_id: 42 }))
    expect(res.status).toBe(401)
  })
})
