import { randomInt, createHash, timingSafeEqual } from 'crypto'

/** How many single-use backup codes we issue at enrollment. */
export const RECOVERY_CODE_COUNT = 8

// Crockford-ish base32 without ambiguous chars is overkill here; we use the
// lowercase RFC-4648 alphabet minus 0/1/8/9 to avoid visual ambiguity.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

function randomBlock(len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

/**
 * Generate a batch of unique, single-use backup codes formatted `xxxx-xxxx`.
 * These are shown to the user exactly once; only their hashes are stored.
 */
export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>()
  while (codes.size < RECOVERY_CODE_COUNT) {
    codes.add(`${randomBlock(4)}-${randomBlock(4)}`)
  }
  return Array.from(codes)
}

// Codes are high-entropy random values, so a fast hash (SHA-256) with a
// constant-time compare is appropriate — no need for a slow password KDF.
function normalise(code: string): string {
  return code.trim().toLowerCase()
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalise(code)).digest('hex')
}

export function verifyRecoveryCode(candidate: string, storedHash: string): boolean {
  const candidateHash = hashRecoveryCode(candidate)
  const a = Buffer.from(candidateHash, 'hex')
  const b = Buffer.from(storedHash, 'hex')
  // timingSafeEqual throws if lengths differ; a malformed stored hash must fail
  // closed (false), not throw.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
