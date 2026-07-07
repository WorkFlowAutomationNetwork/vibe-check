import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const checkRateLimit = vi.fn()
const consumeRecoveryCode = vi.fn()
const resetUserMfa = vi.fn()
const logActivity = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }))
vi.mock('@/lib/mfa/server', () => ({
  consumeRecoveryCode: (...a: unknown[]) => consumeRecoveryCode(...a),
  resetUserMfa: (...a: unknown[]) => resetUserMfa(...a),
}))

import { POST } from './route'

function call(body: unknown = { code: 'aaaa-1111' }) {
  return POST(new Request('http://localhost/api/auth/mfa/recover', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  checkRateLimit.mockResolvedValue({ ok: true, remaining: 5, retryAfterSeconds: 0 })
  consumeRecoveryCode.mockResolvedValue(true)
})

describe('POST /api/auth/mfa/recover', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call()
    expect(res.status).toBe(401)
    expect(consumeRecoveryCode).not.toHaveBeenCalled()
  })

  it('returns 429 with Retry-After when over the recovery rate limit', async () => {
    checkRateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 120 })
    const res = await call()
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('120')
    expect(consumeRecoveryCode).not.toHaveBeenCalled()
  })

  it('returns 422 on a malformed body', async () => {
    const res = await call({ nope: true })
    expect(res.status).toBe(422)
    expect(consumeRecoveryCode).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_code and does not reset when the code does not match', async () => {
    consumeRecoveryCode.mockResolvedValue(false)
    const res = await call()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
    expect(resetUserMfa).not.toHaveBeenCalled()
  })

  it('resets MFA and logs on a valid code', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(resetUserMfa).toHaveBeenCalledWith('user-1')
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'mfa_recovered' }),
    )
  })
})
