import { describe, it, expect } from 'vitest'
import { generateWebhookToken, hashToken } from './vercel-webhook'

describe('generateWebhookToken', () => {
  it('returns a 64-character hex string', () => {
    expect(generateWebhookToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a unique value each call', () => {
    expect(generateWebhookToken()).not.toBe(generateWebhookToken())
  })
})

describe('hashToken', () => {
  it('returns a 64-character hex string', () => {
    expect(hashToken('test-token')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashToken('test-token')).toBe(hashToken('test-token'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('xyz'))
  })
})
