import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  process.env.GITHUB_APP_CLIENT_SECRET = 'test-state-secret'
  process.env.GITHUB_APP_SLUG = 'vibe-check'
  process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret'
  vi.resetModules()
})

describe('state signing', () => {
  it('round-trips a userId', async () => {
    const { signState, verifyState } = await import('./app')
    const state = signState({ userId: 'user-123' })
    expect(verifyState(state)).toEqual({ userId: 'user-123' })
  })

  it('rejects a tampered state', async () => {
    const { signState, verifyState } = await import('./app')
    const state = signState({ userId: 'user-123' })
    expect(verifyState(state.slice(0, -2) + 'xy')).toBeNull()
  })

  it('rejects an expired state', async () => {
    const { signState, verifyState } = await import('./app')
    vi.useFakeTimers()
    const state = signState({ userId: 'user-123' })
    vi.advanceTimersByTime(11 * 60 * 1000) // 11 minutes
    expect(verifyState(state)).toBeNull()
    vi.useRealTimers()
  })
})

describe('buildInstallUrl', () => {
  it('points at the app slug and carries the state', async () => {
    const { buildInstallUrl } = await import('./app')
    const url = buildInstallUrl('the-state')
    expect(url).toBe('https://github.com/apps/vibe-check/installations/new?state=the-state')
  })
})

describe('verifyWebhook', () => {
  it('accepts a correctly signed body and rejects a bad signature', async () => {
    const { sign } = await import('@octokit/webhooks-methods')
    const { verifyWebhook } = await import('./app')
    const body = JSON.stringify({ action: 'created' })
    const good = await sign('test-webhook-secret', body)
    expect(await verifyWebhook(body, good)).toBe(true)
    expect(await verifyWebhook(body, 'sha256=deadbeef')).toBe(false)
    expect(await verifyWebhook(body, null)).toBe(false)
  })
})
