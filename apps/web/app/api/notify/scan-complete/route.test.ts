import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUserById, mockSendEmail } = vi.hoisted(() => ({
  mockGetUserById: vi.fn(),
  mockSendEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => ({
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}))

vi.mock('@/lib/email/client', () => ({ sendEmail: mockSendEmail }))

vi.mock('@/lib/email/templates/scan-complete', () => ({
  scanCompleteEmail: vi.fn(() => ({ subject: 'Ready', html: '<p>done</p>' })),
}))

import { POST } from './route'

const VALID_KEY = 'test-internal-key'

function makeRequest(body: unknown, key?: string): Request {
  return new Request('http://localhost/api/notify/scan-complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key !== undefined ? { 'x-internal-key': key } : {}),
    },
    body: JSON.stringify(body),
  })
}

const validBody = {
  scan_id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  url: 'https://example.com',
  grade: 'B',
  has_critical: false,
}

beforeEach(() => {
  vi.stubEnv('SCANNER_INTERNAL_KEY', VALID_KEY)
  mockGetUserById.mockReset()
  mockSendEmail.mockReset()
})

describe('POST /api/notify/scan-complete', () => {
  it('returns 401 for missing key', async () => {
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns 401 for wrong key', async () => {
    const res = await POST(makeRequest(validBody, 'wrong-key'))
    expect(res.status).toBe(401)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns 422 for malformed body', async () => {
    const res = await POST(makeRequest({ bad: true }, VALID_KEY))
    expect(res.status).toBe(422)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('sends email and returns 200 for valid request', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { email: 'u@x.com' } }, error: null })
    const res = await POST(makeRequest(validBody, VALID_KEY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'u@x.com' })
    )
  })

  it('returns 200 without sending email when user has no email', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { email: null } }, error: null })
    const res = await POST(makeRequest(validBody, VALID_KEY))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
