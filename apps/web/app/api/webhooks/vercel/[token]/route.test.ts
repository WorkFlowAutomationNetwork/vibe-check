import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/vercel-webhook', () => ({
  hashToken: (t: string) => 'hashed_' + t,
}))

// Track mock calls for assertions
const mockDispatch = vi.fn().mockResolvedValue(true)

// Supabase chain mocks — rebuilt per test via mockFrom
let mockFrom: ReturnType<typeof vi.fn>

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// Mock fetch for scanner dispatch
vi.stubGlobal('fetch', mockDispatch)

function makeRequest(token: string, body: object = {}) {
  return {
    request: new Request(`https://app.test/api/webhooks/vercel/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: { token },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/webhooks/vercel/[token]', () => {
  it('returns 401 for an unknown token', async () => {
    mockFrom = vi.fn(() => ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
    }))
    const { POST } = await import('./route')
    const { request, params } = makeRequest('bad-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(401)
  })

  it('returns 200 with queued:0 when user has no eligible URLs', async () => {
    // Integration found, but no URLs
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [] }) }) }) }) }) }
      return {}
    })
    const { POST } = await import('./route')
    const { request, params } = makeRequest('valid-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 0 })
  })

  it('returns 200 with queued:0 when all URLs already have an active scan', async () => {
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [{ id: 'url-1' }] }) }) }) }) }) }
      if (table === 'scans') {
        return { select: () => ({ eq: () => ({ in: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'existing-scan' } }) }) }) }) }
      }
      return {}
    })
    const { POST } = await import('./route')
    const { request, params } = makeRequest('valid-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 0 })
  })

  it('queues a scan and returns queued:1 for an eligible URL', async () => {
    mockDispatch.mockResolvedValue({ ok: true })
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [{ id: 'url-1' }] }) }) }) }) }) }
      if (table === 'scans') {
        return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new-scan' } }) }) }),
        }
      }
      return {}
    })
    const { POST } = await import('./route')
    const { request, params } = makeRequest('valid-token')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 1 })
  })

  it('returns 200 even when the request body is malformed JSON', async () => {
    mockFrom = vi.fn((table: string) => {
      if (table === 'integrations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'int-1', user_id: 'user-1' } }) }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      if (table === 'webhook_log') return { insert: () => Promise.resolve({}) }
      if (table === 'urls') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [] }) }) }) }) }) }
      return {}
    })
    const { POST } = await import('./route')
    const badRequest = new Request('https://app.test/api/webhooks/vercel/valid-token', {
      method: 'POST',
      body: 'not json at all',
    })
    const res = await POST(badRequest, { params: { token: 'valid-token' } })
    expect(res.status).toBe(200)
  })
})
