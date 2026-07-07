import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const getAal = vi.fn()
const issueRecoveryCodes = vi.fn()
const markEnrolled = vi.fn()
const logActivity = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: getAal } },
  }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }))
vi.mock('@/lib/mfa/server', () => ({
  issueRecoveryCodes: (...a: unknown[]) => issueRecoveryCodes(...a),
  markEnrolled: (...a: unknown[]) => markEnrolled(...a),
}))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
  issueRecoveryCodes.mockResolvedValue(['aaaa-1111', 'bbbb-2222'])
})

describe('POST /api/auth/mfa/enroll-complete', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(issueRecoveryCodes).not.toHaveBeenCalled()
    expect(markEnrolled).not.toHaveBeenCalled()
  })

  it('returns 403 when the session is not AAL2 (no verified factor)', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    const res = await POST()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'factor_not_verified' })
    expect(markEnrolled).not.toHaveBeenCalled()
  })

  it('issues codes, marks enrolled, and logs on success', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ codes: ['aaaa-1111', 'bbbb-2222'] })
    expect(markEnrolled).toHaveBeenCalledWith('user-1')
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'mfa_enrolled' }),
    )
  })
})
