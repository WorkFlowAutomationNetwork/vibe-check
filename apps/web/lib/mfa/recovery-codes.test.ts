import { describe, it, expect } from 'vitest'
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-codes'

describe('generateRecoveryCodes', () => {
  it('generates the configured number of codes', () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT)
  })

  it('formats codes as xxxx-xxxx of lowercase base32 chars', () => {
    for (const code of generateRecoveryCodes()) {
      expect(code).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/)
    }
  })

  it('produces unique codes within a batch', () => {
    const codes = generateRecoveryCodes()
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('produces different codes across batches', () => {
    expect(generateRecoveryCodes()).not.toEqual(generateRecoveryCodes())
  })
})

describe('hashRecoveryCode', () => {
  it('does not store the plaintext', () => {
    const code = 'abcd-2345'
    const hash = hashRecoveryCode(code)
    expect(hash).not.toContain(code)
    expect(hash).toMatch(/^[a-f0-9]{64}$/) // sha256 hex
  })

  it('is deterministic and normalises case/whitespace', () => {
    expect(hashRecoveryCode('abcd-2345')).toBe(hashRecoveryCode('  ABCD-2345 '))
  })
})

describe('verifyRecoveryCode', () => {
  it('returns true for a matching code/hash pair', () => {
    const code = 'abcd-2345'
    expect(verifyRecoveryCode(code, hashRecoveryCode(code))).toBe(true)
  })

  it('normalises the candidate before comparing', () => {
    const hash = hashRecoveryCode('abcd-2345')
    expect(verifyRecoveryCode('ABCD-2345', hash)).toBe(true)
  })

  it('returns false for a non-matching code', () => {
    expect(verifyRecoveryCode('zzzz-7777', hashRecoveryCode('abcd-2345'))).toBe(false)
  })

  it('returns false rather than throwing on a malformed stored hash', () => {
    expect(verifyRecoveryCode('abcd-2345', 'not-a-hash')).toBe(false)
  })
})
