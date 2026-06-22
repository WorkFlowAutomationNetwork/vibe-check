import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const deleteInstallation = vi.fn()
vi.mock('@/lib/github/app', () => ({
  deleteInstallation: (id: number) => deleteInstallation(id),
}))

// Ownership lookup result (github_installations select). Controlled per-test.
let ownedResult: { data: unknown } = { data: { installation_id: 42 } }

const instEq2 = vi.fn().mockResolvedValue({ error: null })
const instUpdate = vi.fn(() => ({ eq: () => ({ eq: () => instEq2() }) }))
const repoEq2 = vi.fn().mockResolvedValue({ error: null })
const repoUpdate = vi.fn(() => ({ eq: () => ({ eq: () => repoEq2() }) }))
const instSelect = vi.fn(() => ({
  eq: () => ({ eq: () => ({ maybeSingle: async () => ownedResult }) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: (t: string) =>
      t === 'github_installations'
        ? { select: instSelect, update: instUpdate }
        : { update: repoUpdate },
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
  ownedResult = { data: { installation_id: 42 } }
  deleteInstallation.mockResolvedValue(undefined)
})

describe('POST github disconnect', () => {
  it('uninstalls on GitHub, revokes the installation and removes its repos', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ installation_id: 42 }))
    expect(res.status).toBe(200)
    expect(deleteInstallation).toHaveBeenCalledWith(42)
    expect(instUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
    expect(repoUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }))
  })

  it('still revokes locally if the GitHub uninstall call fails', async () => {
    deleteInstallation.mockRejectedValue(new Error('github down'))
    const { POST } = await import('./route')
    const res = await POST(post({ installation_id: 42 }))
    expect(res.status).toBe(200)
    expect(instUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
  })

  it('refuses to uninstall an installation the user does not own (no IDOR)', async () => {
    ownedResult = { data: null }
    const { POST } = await import('./route')
    const res = await POST(post({ installation_id: 999 }))
    expect(res.status).toBe(404)
    expect(deleteInstallation).not.toHaveBeenCalled()
    expect(instUpdate).not.toHaveBeenCalled()
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
