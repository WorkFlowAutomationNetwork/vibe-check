import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const single = vi.fn()
const update = vi.fn()
const logActivity = vi.fn()
const assertSafeHostname = vi.fn()
const safeFetch = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ single }) }) }) }) }),
  }),
  createServiceClient: () => ({
    from: () => ({ update: (...a: unknown[]) => { update(...a); return { eq: () => Promise.resolve({}) } } }),
  }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }))
vi.mock('@/lib/security/ssrf', () => ({
  SsrfError: class SsrfError extends Error {},
  assertSafeHostname: (...a: unknown[]) => assertSafeHostname(...a),
  safeFetch: (...a: unknown[]) => safeFetch(...a),
}))

import { POST } from './route'
import { SsrfError } from '@/lib/security/ssrf'

function call() {
  return POST(new Request('http://localhost/api/verify', {
    method: 'POST',
    body: JSON.stringify({ url_id: '11111111-1111-1111-1111-111111111111', method: 'file' }),
    headers: { 'Content-Type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  single.mockResolvedValue({ data: {
    id: 'url-1', url: 'https://example.com', verification_token: 'vc-verify=tok', verified: false,
  } })
  assertSafeHostname.mockReturnValue(undefined)
})

describe('POST /api/verify SSRF guard', () => {
  it('returns 422 unsupported_host when the host is blocked', async () => {
    assertSafeHostname.mockImplementation(() => { throw new SsrfError('blocked') })
    const res = await call()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'unsupported_host' })
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('verifies via safeFetch when the file matches the token', async () => {
    safeFetch.mockResolvedValue({ ok: true, text: async () => 'vc-verify=tok' })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ verified: true })
    expect(safeFetch).toHaveBeenCalledWith(
      'https://example.com/.well-known/vibe-check-verify.txt',
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(update).toHaveBeenCalled()
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'url_verified' }))
  })
})
