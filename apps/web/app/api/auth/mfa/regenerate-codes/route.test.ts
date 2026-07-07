import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const getAal = vi.fn()
const issueRecoveryCodes = vi.fn()
const logActivity = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: getAal } },
  }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }))
vi.mock('@/lib/mfa/server', () => ({
  issueRecoveryCodes: (...a: unknown[]) => issueRecoveryCodes(...a),
}))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
  issueRecoveryCodes.mockResolvedValue(['cccc-3333', 'dddd-4444'])
})

describe('POST /api/auth/mfa/regenerate-codes', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(issueRecoveryCodes).not.toHaveBeenCalled()
  })

  it('returns 403 when the session is only AAL1', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    const res = await POST()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'aal2_required' })
    expect(issueRecoveryCodes).not.toHaveBeenCalled()
  })

  it('regenerates and returns a fresh set on success', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ codes: ['cccc-3333', 'dddd-4444'] })
    expect(issueRecoveryCodes).toHaveBeenCalledWith('user-1')
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'mfa_codes_regenerated' }),
    )
  })
})
