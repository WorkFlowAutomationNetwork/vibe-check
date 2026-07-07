import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const isAdminSingle = vi.fn()
const updateUserById = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: isAdminSingle }) }) }),
    auth: { admin: { updateUserById } },
  }),
}))

import { POST } from './route'

function call(userId = 'target-1') {
  return POST(new NextRequest('http://localhost/api/admin/users/target-1/confirm-email', { method: 'POST' }), {
    params: { userId },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  isAdminSingle.mockResolvedValue({ data: { is_admin: true } })
  updateUserById.mockResolvedValue({ error: null })
})

describe('POST /api/admin/users/[userId]/confirm-email', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await call()).status).toBe(401)
  })

  it('returns 403 when the caller is not an admin', async () => {
    isAdminSingle.mockResolvedValue({ data: { is_admin: false } })
    expect((await call()).status).toBe(403)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('confirms the target email and redirects back to the detail page', async () => {
    const res = await call()
    expect(res.status).toBe(307)
    expect(updateUserById).toHaveBeenCalledWith('target-1', { email_confirm: true })
    expect(res.headers.get('location')).toContain('/admin/users/target-1')
  })

  it('returns 500 when the confirm call errors', async () => {
    updateUserById.mockResolvedValue({ error: { message: 'boom' } })
    expect((await call()).status).toBe(500)
  })
})
