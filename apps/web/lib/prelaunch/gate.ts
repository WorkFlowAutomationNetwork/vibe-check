import { NextResponse, type NextRequest } from 'next/server'

export const COOKIE_NAME = 'vibe_prelaunch'
const TOKEN_MARKER = 'vibe-check-prelaunch-v1'

// The lock guards only these prefixes — the rest of the site stays publicly
// browsable pre-launch. Testers unlock sign-up with the prelaunch password.
const GUARDED_PREFIXES = [
  '/sign-up',
]

export function isLockEngaged(): boolean {
  return process.env.PRELAUNCH_LOCK_ENABLED === 'true'
}

export function getConfiguredPassword(): string {
  return process.env.PRELAUNCH_PASSWORD ?? ''
}

export function isGuardedPath(pathname: string): boolean {
  return GUARDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// Length-independent compare. Reveals only length, which is acceptable here.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function signToken(password: string): Promise<string> {
  // Handle empty password: return a deterministic but invalid placeholder
  // (diverges from reference: Web Crypto importKey throws DataError on zero-length key)
  if (!password) {
    return 'empty-password-invalid'
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(TOKEN_MARKER))
  return toHex(sig)
}

export async function verifyToken(token: string | undefined, password: string): Promise<boolean> {
  if (!token || !password) return false
  const expected = await signToken(password)
  return constantTimeEqual(token, expected)
}

export async function prelaunchGate(request: NextRequest): Promise<NextResponse | null> {
  if (!isLockEngaged()) return null
  const { pathname } = request.nextUrl
  if (!isGuardedPath(pathname)) return null

  const token = request.cookies.get(COOKIE_NAME)?.value
  if (await verifyToken(token, getConfiguredPassword())) return null

  const url = request.nextUrl.clone()
  url.pathname = '/prelaunch'
  return NextResponse.rewrite(url)
}
