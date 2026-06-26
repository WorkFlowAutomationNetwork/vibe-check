import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: (table: string) => ({
      upsert: mockUpsert,
      update: () => ({ eq: () => ({ eq: mockUpdateEq }) }),
    }),
  }),
}))

vi.mock('@/lib/vercel-webhook', () => ({
  generateWebhookToken: () => 'a'.repeat(64),
  hashToken: (t: string) => 'hashed_' + t,
}))

function makeRequest(method: string) {
  return new Request('https://app.test/api/integrations/vercel', {
    method,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/integrations/vercel', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('./route')
    const res = await POST(makeRequest('POST'))
    expect(res.status).toBe(401)
  })

  it('upserts an integrations row and returns a webhookUrl', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { POST } = await import('./route')
    const res = await POST(makeRequest('POST'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.webhookUrl).toContain('/api/webhooks/vercel/' + 'a'.repeat(64))
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        type: 'vercel',
        status: 'active',
        config: expect.objectContaining({ token_hash: 'hashed_' + 'a'.repeat(64) }),
      }),
      expect.objectContaining({ onConflict: 'user_id,type' }),
    )
  })
})

describe('DELETE /api/integrations/vercel', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { DELETE } = await import('./route')
    const res = await DELETE(makeRequest('DELETE'))
    expect(res.status).toBe(401)
  })

  it('sets integration status to disconnected and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { DELETE } = await import('./route')
    const res = await DELETE(makeRequest('DELETE'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(mockUpdateEq).toHaveBeenCalled()
  })
})
