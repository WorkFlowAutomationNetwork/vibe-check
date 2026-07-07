import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const adminSingle = vi.fn()
const resetUserMfa = vi.fn()
const logActivity = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: adminSingle }) }) }),
  }),
}))
vi.mock('@/lib/mfa/server', () => ({ resetUserMfa: (...a: unknown[]) => resetUserMfa(...a) }))
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }))

import { POST } from './route'

function call() {
  return POST(
    new NextRequest('http://localhost/api/admin/users/target-1/reset-mfa', { method: 'POST' }),
    { params: { userId: 'target-1' } },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  adminSingle.mockResolvedValue({ data: { is_admin: true } })
})

describe('POST /api/admin/users/[userId]/reset-mfa', () => {
  it('returns 403 when the caller is not an admin', async () => {
    adminSingle.mockResolvedValue({ data: { is_admin: false } })
    const res = await call()
    expect(res.status).toBe(403)
    expect(resetUserMfa).not.toHaveBeenCalled()
  })

  it('returns 403 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call()
    expect(res.status).toBe(403)
    expect(resetUserMfa).not.toHaveBeenCalled()
  })

  it('resets the target user MFA and redirects on success', async () => {
    const res = await call()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/users/target-1?mfa=reset')
    expect(resetUserMfa).toHaveBeenCalledWith('target-1')
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', eventType: 'admin_mfa_reset' }),
    )
  })
})
