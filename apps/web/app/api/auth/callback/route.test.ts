import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExchangeCodeForSession, mockSendEmail } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
  mockSendEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  })),
}))

vi.mock('@/lib/email/client', () => ({ sendEmail: mockSendEmail }))

vi.mock('@/lib/email/templates/welcome', () => ({
  welcomeEmail: vi.fn(() => ({ subject: 'Welcome', html: '<p>hi</p>' })),
}))

import { GET } from './route'

function makeRequest(code: string | null, next?: string): Request {
  const url = new URL('http://localhost/api/auth/callback')
  if (code) url.searchParams.set('code', code)
  if (next) url.searchParams.set('next', next)
  return new Request(url.toString())
}

const NEW_USER_CREATED_AT = new Date(Date.now() - 60_000).toISOString()     // 1 min ago
const OLD_USER_CREATED_AT = new Date(Date.now() - 10 * 60_000).toISOString() // 10 min ago

beforeEach(() => {
  mockExchangeCodeForSession.mockReset()
  mockSendEmail.mockReset()
})

describe('GET /api/auth/callback', () => {
  it('redirects to /dashboard on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { email: 'a@b.com', created_at: NEW_USER_CREATED_AT } },
      error: null,
    })
    const res = await GET(makeRequest('valid-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('sends welcome email to new users (created < 5 min ago)', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { email: 'new@example.com', created_at: NEW_USER_CREATED_AT } },
      error: null,
    })
    await GET(makeRequest('valid-code'))
    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@example.com' })
    )
  })

  it('does NOT send welcome email to returning users (created > 5 min ago)', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { email: 'old@example.com', created_at: OLD_USER_CREATED_AT } },
      error: null,
    })
    await GET(makeRequest('valid-code'))
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('redirects to sign-in on exchange error', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid code' },
    })
    const res = await GET(makeRequest('bad-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sign-in')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('redirects to sign-in when no code param', async () => {
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sign-in')
  })
})
