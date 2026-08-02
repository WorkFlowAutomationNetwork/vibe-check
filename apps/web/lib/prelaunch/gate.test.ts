import { describe, it, expect, beforeEach } from 'vitest'
import {
  COOKIE_NAME, isLockEngaged, getConfiguredPassword, isExemptPath,
  constantTimeEqual, signToken, verifyToken,
} from './gate'

describe('prelaunch gate primitives', () => {
  beforeEach(() => {
    delete process.env.PRELAUNCH_LOCK_ENABLED
    delete process.env.PRELAUNCH_PASSWORD
  })

  it('exposes the fixed cookie name', () => {
    expect(COOKIE_NAME).toBe('vibe_prelaunch')
  })

  it('lock is engaged only when the flag is exactly "true"', () => {
    expect(isLockEngaged()).toBe(false)
    process.env.PRELAUNCH_LOCK_ENABLED = 'false'
    expect(isLockEngaged()).toBe(false)
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    expect(isLockEngaged()).toBe(true)
  })

  it('reads the configured password, empty when unset', () => {
    expect(getConfiguredPassword()).toBe('')
    process.env.PRELAUNCH_PASSWORD = 'hunter2'
    expect(getConfiguredPassword()).toBe('hunter2')
  })

  it('exempts the allowlisted prefixes and their subpaths, nothing else', () => {
    for (const p of ['/prelaunch', '/api/prelaunch/unlock', '/api/billing/stripe-webhook',
      '/api/webhooks/vercel', '/api/scans', '/api/repo-scans', '/api/auth/callback', '/auth/confirm',
      '/api/badge', '/api/badge/x/image']) {
      expect(isExemptPath(p)).toBe(true)
    }
    for (const p of ['/', '/dashboard', '/sign-in', '/sign-up', '/report/abc/public', '/prelaunchx']) {
      expect(isExemptPath(p)).toBe(false)
    }
  })

  it('constantTimeEqual matches equal strings and rejects others', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })

  it('signToken with empty password returns the exact sentinel string', async () => {
    const token = await signToken('')
    expect(token).toBe('empty-password-invalid')
  })

  it('verifyToken accepts a token signed with the same password', async () => {
    const token = await signToken('s3cret')
    expect(await verifyToken(token, 's3cret')).toBe(true)
  })

  it('verifyToken rejects a token signed with a different password (rotation invalidates)', async () => {
    const token = await signToken('old-pass')
    expect(await verifyToken(token, 'new-pass')).toBe(false)
  })

  it('fails closed: empty password never verifies, even with a matching-shaped token', async () => {
    const token = await signToken('')
    expect(await verifyToken(token, '')).toBe(false)
    expect(await verifyToken(undefined, 'x')).toBe(false)
  })
})

import { NextRequest } from 'next/server'
import { prelaunchGate, signToken as sign } from './gate'

describe('prelaunchGate(request)', () => {
  beforeEach(() => {
    delete process.env.PRELAUNCH_LOCK_ENABLED
    delete process.env.PRELAUNCH_PASSWORD
  })

  function req(path: string, cookie?: string) {
    const r = new NextRequest(new URL(`http://localhost${path}`))
    if (cookie) r.cookies.set('vibe_prelaunch', cookie)
    return r
  }

  it('returns null when the lock is off', async () => {
    expect(await prelaunchGate(req('/dashboard'))).toBeNull()
  })

  it('rewrites to /prelaunch when locked with no cookie on a guarded path', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'pw'
    for (const p of ['/', '/dashboard', '/sign-in', '/sign-up', '/report/abc/public']) {
      const res = await prelaunchGate(req(p))
      expect(res).not.toBeNull()
      expect(res!.headers.get('x-middleware-rewrite')).toContain('/prelaunch')
    }
  })

  it('returns null for exempt paths even when locked', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'pw'
    expect(await prelaunchGate(req('/api/billing/stripe-webhook'))).toBeNull()
    expect(await prelaunchGate(req('/prelaunch'))).toBeNull()
  })

  // Badge images are embedded on other sites — the wall must not swallow them
  // and serve coming-soon HTML into an <img> tag.
  it('leaves badge images public even when locked', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'pw'
    expect(await prelaunchGate(req('/api/badge/x/image'))).toBeNull()
  })

  it('returns null when locked with a valid cookie', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'pw'
    const token = await sign('pw')
    expect(await prelaunchGate(req('/dashboard', token))).toBeNull()
  })

  it('rewrites when locked with a stale cookie from an old password', async () => {
    process.env.PRELAUNCH_LOCK_ENABLED = 'true'
    process.env.PRELAUNCH_PASSWORD = 'new-pw'
    const stale = await sign('old-pw')
    const res = await prelaunchGate(req('/dashboard', stale))
    expect(res!.headers.get('x-middleware-rewrite')).toContain('/prelaunch')
  })
})
