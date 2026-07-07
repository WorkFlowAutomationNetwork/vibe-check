import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const isAdminSingle = vi.fn()
const profilesIn = vi.fn()
const listUsers = vi.fn()
const createUser = vi.fn()
const updateEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: isAdminSingle }),
        in: (...a: unknown[]) => profilesIn(...a),
      }),
      update: () => ({ eq: (...a: unknown[]) => updateEq(...a) }),
    }),
    auth: { admin: { listUsers, createUser } },
  }),
}))

import { GET, POST } from './route'

function getReq(qs = '') {
  return new NextRequest(`http://localhost/api/admin/users${qs}`)
}
function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_CREATE = { email: 'new@example.com', password: 'longenoughpw12', plan: 'starter', is_admin: false }

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  isAdminSingle.mockResolvedValue({ data: { is_admin: true } })
  listUsers.mockResolvedValue({
    data: { users: [{ id: 'u1', email: 'a@x.com', created_at: 't', last_sign_in_at: null, email_confirmed_at: 't' }], total: 1 },
    error: null,
  })
  profilesIn.mockResolvedValue({ data: [{ id: 'u1', plan: 'monitor', is_admin: false, name: 'A' }] })
  createUser.mockResolvedValue({ data: { user: { id: 'new-1' } }, error: null })
  updateEq.mockResolvedValue({ error: null })
})

describe('GET /api/admin/users', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(getReq())).status).toBe(401)
  })

  it('returns 403 when the caller is not an admin', async () => {
    isAdminSingle.mockResolvedValue({ data: { is_admin: false } })
    expect((await GET(getReq())).status).toBe(403)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('lists users merged with their profile rows', async () => {
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.users[0]).toEqual(expect.objectContaining({ id: 'u1', email: 'a@x.com', plan: 'monitor' }))
  })
})

describe('POST /api/admin/users', () => {
  it('returns 403 for a non-admin before creating anything', async () => {
    isAdminSingle.mockResolvedValue({ data: { is_admin: false } })
    expect((await POST(postReq(VALID_CREATE))).status).toBe(403)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('returns 422 on an invalid body (password too short)', async () => {
    const res = await POST(postReq({ ...VALID_CREATE, password: 'short' }))
    expect(res.status).toBe(422)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('creates the auth user and applies plan/admin to the profile', async () => {
    const res = await POST(postReq(VALID_CREATE))
    expect(res.status).toBe(201)
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com', email_confirm: true }))
    expect(updateEq).toHaveBeenCalledWith('id', 'new-1')
  })

  it('returns 500 when auth user creation fails', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } })
    expect((await POST(postReq(VALID_CREATE))).status).toBe(500)
  })
})
