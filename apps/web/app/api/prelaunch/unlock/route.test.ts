import { describe, it, expect, beforeEach } from 'vitest'

describe('POST /api/prelaunch/unlock', () => {
  beforeEach(() => {
    process.env.PRELAUNCH_PASSWORD = 'correct-horse'
  })

  function post(password: string) {
    const body = new URLSearchParams({ password })
    return new Request('http://localhost/api/prelaunch/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  }

  it('sets the cookie and redirects to the site root on the correct password', async () => {
    const { POST } = await import('./route')
    const res = await POST(post('correct-horse'))
    expect(res.status).toBe(303)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/')
    expect(res.headers.get('set-cookie')).toContain('vibe_prelaunch=')
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('redirects with error and sets no cookie on the wrong password', async () => {
    const { POST } = await import('./route')
    const res = await POST(post('wrong'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/prelaunch?error=1')
    expect(res.headers.get('set-cookie') ?? '').not.toContain('vibe_prelaunch=')
  })

  it('rejects every attempt when no password is configured (fail closed)', async () => {
    process.env.PRELAUNCH_PASSWORD = ''
    const { POST } = await import('./route')
    const res = await POST(post(''))
    expect(res.headers.get('location')).toContain('/prelaunch?error=1')
    expect(res.headers.get('set-cookie') ?? '').not.toContain('vibe_prelaunch=')
  })
})
