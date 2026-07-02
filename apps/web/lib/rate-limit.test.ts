import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc }),
}))

import { checkRateLimit, clientIp } from './rate-limit'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkRateLimit', () => {
  it('allows when under the limit and passes the RPC args through', async () => {
    rpc.mockReturnValue({
      single: () =>
        Promise.resolve({
          data: { allowed: true, remaining: 4, reset_at: new Date(Date.now() + 60_000).toISOString() },
          error: null,
        }),
    })
    const r = await checkRateLimit({ key: 'notify:ip:1.2.3.4', max: 5, windowSeconds: 60 })
    expect(r.ok).toBe(true)
    expect(r.remaining).toBe(4)
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'notify:ip:1.2.3.4',
      p_max: 5,
      p_window_seconds: 60,
    })
  })

  it('blocks when over the limit and reports a positive retryAfter', async () => {
    rpc.mockReturnValue({
      single: () =>
        Promise.resolve({
          data: { allowed: false, remaining: 0, reset_at: new Date(Date.now() + 30_000).toISOString() },
          error: null,
        }),
    })
    const r = await checkRateLimit({ key: 'k', max: 5, windowSeconds: 60 })
    expect(r.ok).toBe(false)
    expect(r.retryAfterSeconds).toBeGreaterThan(0)
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(30)
  })

  it('fails OPEN on an RPC error — a limiter outage must not take the endpoint down', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'db down' } }),
    })
    const r = await checkRateLimit({ key: 'k', max: 5, windowSeconds: 60 })
    expect(r.ok).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('fails OPEN if the client throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockImplementation(() => {
      throw new Error('boom')
    })
    const r = await checkRateLimit({ key: 'k', max: 5, windowSeconds: 60 })
    expect(r.ok).toBe(true)
    spy.mockRestore()
  })
})

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(clientIp(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip, then to "unknown"', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9')
    expect(clientIp(new Request('http://x'))).toBe('unknown')
  })
})
