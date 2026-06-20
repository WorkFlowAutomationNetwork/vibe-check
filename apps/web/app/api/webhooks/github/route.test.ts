import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyWebhook = vi.fn()
vi.mock('@/lib/github/app', () => ({ verifyWebhook: (b: string, s: string | null) => verifyWebhook(b, s) }))

const updateEq = vi.fn().mockResolvedValue({ error: null })
const installsUpdate = vi.fn(() => ({ eq: () => updateEq() }))
const reposUpdate = vi.fn(() => ({ eq: () => ({ eq: () => updateEq() }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (t: string) => (t === 'github_installations' ? { update: installsUpdate } : { update: reposUpdate }),
  }),
}))

function post(body: object, sig = 'sha256=ok') {
  return new Request('https://app.test/api/webhooks/github', {
    method: 'POST',
    headers: { 'x-hub-signature-256': sig, 'x-github-event': 'installation' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyWebhook.mockResolvedValue(true)
})

describe('POST github webhook', () => {
  it('401s on a bad signature', async () => {
    verifyWebhook.mockResolvedValue(false)
    const { POST } = await import('./route')
    const res = await POST(post({ action: 'deleted', installation: { id: 7 } }))
    expect(res.status).toBe(401)
  })

  it('marks an installation revoked on the deleted event', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ action: 'deleted', installation: { id: 7 } }))
    expect(res.status).toBe(200)
    expect(installsUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
  })

  it('200s and ignores an unhandled event without throwing', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ action: 'push' }))
    expect(res.status).toBe(200)
  })
})
