import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('POST /api/prelaunch/notify', () => {
  beforeEach(() => {
    state.client = null
    state.upserted = null
  })

  it('stores a valid email (lowercased/trimmed) and redirects to notify=ok', async () => {
    state.client = {
      from: () => ({
        upsert: (row: any) => {
          state.upserted = row
          return Promise.resolve({ error: null })
        },
      }),
    }
    const { POST } = await import('./route')
    const res = await POST(post('  Me@Example.COM '))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/prelaunch?notify=ok')
    expect(state.upserted.email).toBe('me@example.com')
    expect(state.upserted.source).toBe('prelaunch')
  })

  it('returns the same notify=ok state for a duplicate (no enumeration)', async () => {
    state.client = {
      from: () => ({ upsert: () => Promise.resolve({ error: null }) }),
    }
    const { POST } = await import('./route')
    const res = await POST(post('dupe@example.com'))
    expect(res.headers.get('location')).toContain('/prelaunch?notify=ok')
  })

  it('redirects to notify=invalid on a malformed email and does not write', async () => {
    state.client = {
      from: () => ({ upsert: () => { throw new Error('should not be called') } }),
    }
    const { POST } = await import('./route')
    const res = await POST(post('not-an-email'))
    expect(res.headers.get('location')).toContain('/prelaunch?notify=invalid')
  })
})
