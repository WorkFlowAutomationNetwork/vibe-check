import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendEmail } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
}))

vi.mock('@/lib/email/client', () => ({ sendEmail: mockSendEmail }))
vi.mock('@/lib/email/templates/waitlist', () => ({
  waitlistEmail: vi.fn(() => ({ subject: 'Waitlist', html: '<p>waitlist</p>' })),
}))

const state: any = {}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.client,
}))

function post(email: string) {
  const body = new URLSearchParams({ email })
  return new Request('http://localhost/api/prelaunch/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

function makeClient(upsertResult: { error: any; count?: number | null }, onUpsert?: (row: any) => void) {
  return {
    from: () => ({
      upsert: (row: any) => {
        onUpsert?.(row)
        return { select: () => Promise.resolve(upsertResult) }
      },
    }),
  }
}

describe('POST /api/prelaunch/notify', () => {
  beforeEach(() => {
    state.client = null
    mockSendEmail.mockReset()
  })

  it('stores a valid email (lowercased/trimmed) and redirects to notify=ok', async () => {
    let upserted: any = null
    state.client = makeClient({ error: null, count: 1 }, row => { upserted = row })
    const { POST } = await import('./route')
    const res = await POST(post('  Me@Example.COM '))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/prelaunch?notify=ok')
    expect(upserted.email).toBe('me@example.com')
    expect(upserted.source).toBe('prelaunch')
  })

  it('sends confirmation email to new signups', async () => {
    state.client = makeClient({ error: null, count: 1 })
    const { POST } = await import('./route')
    await POST(post('new@example.com'))
    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@example.com' }))
  })

  it('does not send email for duplicate signups', async () => {
    state.client = makeClient({ error: null, count: 0 })
    const { POST } = await import('./route')
    const res = await POST(post('dupe@example.com'))
    expect(res.headers.get('location')).toContain('/prelaunch?notify=ok')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('redirects to notify=invalid on a malformed email and does not write', async () => {
    state.client = makeClient({ error: null, count: 0 })
    const { POST } = await import('./route')
    const res = await POST(post('not-an-email'))
    expect(res.headers.get('location')).toContain('/prelaunch?notify=invalid')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('logs the upsert error server-side but still returns notify=ok (no enumeration)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.client = makeClient({ error: { message: 'boom' }, count: null })
    const { POST } = await import('./route')
    const res = await POST(post('test@example.com'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/prelaunch?notify=ok')
    expect(consoleErrorSpy).toHaveBeenCalledWith('[prelaunch/notify] waitlist upsert failed:', 'boom')
    expect(mockSendEmail).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
