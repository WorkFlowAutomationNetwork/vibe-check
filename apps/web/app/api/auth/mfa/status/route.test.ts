import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const profileSingle = vi.fn()
const codeCount = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: profileSingle }) }) }),
  }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ is: codeCount }) }) }),
  }),
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  profileSingle.mockResolvedValue({ data: { mfa_enrolled_at: '2026-07-07T00:00:00Z' } })
  codeCount.mockResolvedValue({ count: 5 })
})

describe('GET /api/auth/mfa/status', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('reports enrolled with remaining backup-code count', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      enrolled: true,
      enrolledAt: '2026-07-07T00:00:00Z',
      backupCodesRemaining: 5,
    })
  })

  it('reports not-enrolled and skips the code count', async () => {
    profileSingle.mockResolvedValue({ data: { mfa_enrolled_at: null } })
    const res = await GET()
    expect(await res.json()).toEqual({
      enrolled: false,
      enrolledAt: null,
      backupCodesRemaining: 0,
    })
    expect(codeCount).not.toHaveBeenCalled()
  })
})
