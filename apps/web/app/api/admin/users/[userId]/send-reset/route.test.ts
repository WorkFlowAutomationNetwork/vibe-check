import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const isAdminSingle = vi.fn()
const getUserById = vi.fn()
const resetPasswordForEmail = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: isAdminSingle }) }) }),
    auth: { admin: { getUserById }, resetPasswordForEmail },
  }),
}))

import { POST } from './route'

function call(userId = 'target-1') {
  return POST(new NextRequest('http://localhost/api/admin/users/target-1/send-reset', { method: 'POST' }), {
    params: { userId },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  isAdminSingle.mockResolvedValue({ data: { is_admin: true } })
  getUserById.mockResolvedValue({ data: { user: { id: 'target-1', email: 't@x.com' } }, error: null })
  resetPasswordForEmail.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/admin/users/[userId]/send-reset', () => {
  it('returns 403 for a non-admin caller', async () => {
    isAdminSingle.mockResolvedValue({ data: { is_admin: false } })
    expect((await call()).status).toBe(403)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('actually sends the recovery email and redirects with reset=sent', async () => {
    const res = await call()
    expect(res.status).toBe(307)
    expect(resetPasswordForEmail).toHaveBeenCalledWith('t@x.com', expect.objectContaining({
      redirectTo: expect.stringContaining('https://app.example.com/api/auth/callback'),
    }))
    expect(res.headers.get('location')).toContain('reset=sent')
  })

  it('redirects with reset=error when the target has no email', async () => {
    getUserById.mockResolvedValue({ data: { user: { id: 'target-1', email: null } }, error: null })
    const res = await call()
    expect(res.headers.get('location')).toContain('reset=error')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('redirects with reset=error when SMTP send fails', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'smtp down' } })
    const res = await call()
    expect(res.headers.get('location')).toContain('reset=error')
  })
})
