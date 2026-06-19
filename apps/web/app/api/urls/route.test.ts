import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser }, from }),
  createServiceClient: () => ({ from }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))

import { POST } from './route'

function call(url: string) {
  return POST(new Request('http://localhost/api/urls', {
    method: 'POST',
    body: JSON.stringify({ url }),
    headers: { 'Content-Type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('POST /api/urls SSRF guard', () => {
  it.each([
    'http://localhost/',
    'http://169.254.169.254/',
    'https://192.168.0.1/',
    'http://foo.internal/',
  ])('rejects internal host %s with 422 and no DB access', async (url) => {
    const res = await call(url)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'unsupported_host' })
    expect(from).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated (guard does not mask auth)', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call('http://localhost/')
    expect(res.status).toBe(401)
  })
})
