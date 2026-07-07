import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const profileSingle = vi.fn()
const getUserById = vi.fn()
const deleteUser = vi.fn()
const updateCalls: Array<{ payload: Record<string, unknown>; col: string; val: unknown }> = []

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: profileSingle }) }),
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          updateCalls.push({ payload, col, val })
          return Promise.resolve({ error: null })
        },
      }),
    }),
    auth: { admin: { getUserById, deleteUser } },
  }),
}))

import { GET, PATCH, POST, DELETE } from './route'

const TARGET = 'target-1'
function ctx(userId = TARGET) {
  return { params: { userId } }
}
function req(method: string, opts: { json?: unknown; form?: Record<string, string> } = {}) {
  if (opts.form) {
    const fd = new FormData()
    Object.entries(opts.form).forEach(([k, v]) => fd.set(k, v))
    return new NextRequest('http://localhost/api/admin/users/target-1', { method, body: fd })
  }
  return new NextRequest('http://localhost/api/admin/users/target-1', {
    method,
    body: opts.json ? JSON.stringify(opts.json) : undefined,
    headers: opts.json ? { 'Content-Type': 'application/json' } : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  updateCalls.length = 0
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { is_admin: true, id: TARGET, plan: 'free' } })
  getUserById.mockResolvedValue({ data: { user: { id: TARGET, email: 't@x.com' } }, error: null })
  deleteUser.mockResolvedValue({ error: null })
})

describe('GET /api/admin/users/[userId]', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(req('GET'), ctx())).status).toBe(401)
  })

  it('returns 403 when the caller is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { is_admin: false } })
    expect((await GET(req('GET'), ctx())).status).toBe(403)
  })

  it('returns 404 when the target auth user is missing', async () => {
    getUserById.mockResolvedValue({ data: null, error: { message: 'not found' } })
    expect((await GET(req('GET'), ctx())).status).toBe(404)
  })

  it('returns the merged auth user + profile', async () => {
    const res = await GET(req('GET'), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toEqual(expect.objectContaining({ id: TARGET, email: 't@x.com' }))
  })
})

describe('PATCH /api/admin/users/[userId]', () => {
  it('returns 422 on an invalid plan', async () => {
    const res = await PATCH(req('PATCH', { json: { plan: 'enterprise' } }), ctx())
    expect(res.status).toBe(422)
    expect(updateCalls).toHaveLength(0)
  })

  it('sets a ~30-day expiry when granting starter, keyed on the target id', async () => {
    const res = await PATCH(req('PATCH', { json: { plan: 'starter' } }), ctx())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    const { payload, col, val } = updateCalls[0]
    expect(col).toBe('id')
    expect(val).toBe(TARGET)
    expect(payload.plan).toBe('starter')
    const ms = new Date(payload.plan_expires_at as string).getTime() - Date.now()
    expect(ms).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
    expect(ms).toBeLessThan(31 * 24 * 60 * 60 * 1000)
  })

  it('clears expiry for non-starter plans', async () => {
    await PATCH(req('PATCH', { json: { plan: 'monitor' } }), ctx())
    expect(updateCalls[0].payload).toEqual(expect.objectContaining({ plan: 'monitor', plan_expires_at: null }))
  })
})

describe('DELETE /api/admin/users/[userId]', () => {
  it('refuses to delete the caller\'s own account', async () => {
    const res = await DELETE(req('DELETE'), ctx('admin-1'))
    expect(res.status).toBe(400)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('deletes the target user and redirects to the users list', async () => {
    const res = await DELETE(req('DELETE'), ctx())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/users')
    expect(deleteUser).toHaveBeenCalledWith(TARGET)
  })

  it('returns 403 for a non-admin caller', async () => {
    profileSingle.mockResolvedValue({ data: { is_admin: false } })
    expect((await DELETE(req('DELETE'), ctx())).status).toBe(403)
    expect(deleteUser).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/[userId] (form method override)', () => {
  it('routes _method=DELETE to a real delete', async () => {
    const res = await POST(req('POST', { form: { _method: 'DELETE' } }), ctx())
    expect(deleteUser).toHaveBeenCalledWith(TARGET)
    expect(res.headers.get('location')).toContain('/admin/users')
  })

  it('treats a plan form post as an update and redirects back', async () => {
    const res = await POST(req('POST', { form: { plan: 'monitor' } }), ctx())
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].payload).toEqual(expect.objectContaining({ plan: 'monitor' }))
    expect(res.headers.get('location')).toContain(`/admin/users/${TARGET}`)
  })
})
