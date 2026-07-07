import { describe, it, expect, vi, beforeEach } from 'vitest'

const badgeSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: badgeSingle }) }) }) }),
  }),
}))

import { GET } from './route'

function call(token = 'tok_1') {
  return GET(new Request(`http://localhost/api/badge/${token}`), { params: { token } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/badge/[token]', () => {
  it('returns 404 valid:false for an unknown or inactive token', async () => {
    badgeSingle.mockResolvedValue({ data: null })
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ valid: false })
  })

  it('reports expired (200) when the badge is past its expiry', async () => {
    badgeSingle.mockResolvedValue({
      data: { id: 'b1', status: 'active', expires_at: '2000-01-01T00:00:00Z', scan_id: 's1' },
    })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ valid: false, reason: 'expired' })
  })

  it('returns valid:true with badge + scan ids for an active, unexpired badge', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    badgeSingle.mockResolvedValue({
      data: { id: 'b1', status: 'active', expires_at: future, url_id: 'u1', scan_id: 's1' },
    })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ valid: true, badge_id: 'b1', scan_id: 's1' })
  })

  it('treats a null expiry as non-expiring', async () => {
    badgeSingle.mockResolvedValue({
      data: { id: 'b1', status: 'active', expires_at: null, url_id: 'u1', scan_id: 's1' },
    })
    const res = await call()
    expect(await res.json()).toEqual({ valid: true, badge_id: 'b1', scan_id: 's1' })
  })
})
