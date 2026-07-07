import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// --- Mocks ---------------------------------------------------------------
const getUser = vi.fn()
const getAal = vi.fn()
const single = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: getAal } },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}))

vi.mock('@/lib/prelaunch/gate', () => ({ prelaunchGate: async () => null }))

// Toggled per-test via a live getter so `import { mfaRequired }` reads current value.
let mfaRequiredValue = true
vi.mock('@/lib/mfa/config', () => ({ get mfaRequired() { return mfaRequiredValue } }))

import { updateSession } from './middleware'

function req(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`))
}
function loc(res: Response) {
  return res.headers.get('location')
}

beforeEach(() => {
  vi.clearAllMocks()
  mfaRequiredValue = true
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  getAal.mockResolvedValue({ data: { currentLevel: 'aal2' } })
  single.mockResolvedValue({ data: { mfa_enrolled_at: '2026-07-07T00:00:00Z' } })
})

describe('MFA middleware gate', () => {
  it('redirects an unauthenticated user on a protected route to sign-in (before MFA)', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await updateSession(req('/dashboard'))
    expect(loc(res)).toContain('/sign-in')
  })

  it('forces an un-enrolled user to /mfa/enroll', async () => {
    single.mockResolvedValue({ data: { mfa_enrolled_at: null } })
    const res = await updateSession(req('/dashboard'))
    expect(new URL(loc(res)!).pathname).toBe('/mfa/enroll')
  })

  it('forces an enrolled AAL1 user to /mfa with a next param', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1' } })
    const res = await updateSession(req('/dashboard'))
    const url = new URL(loc(res)!)
    expect(url.pathname).toBe('/mfa')
    expect(url.searchParams.get('next')).toBe('/dashboard')
  })

  it('lets an enrolled AAL2 user through', async () => {
    const res = await updateSession(req('/dashboard'))
    expect(loc(res)).toBeNull()
  })

  it('bounces an already-satisfied user off the /mfa page to the dashboard', async () => {
    const res = await updateSession(req('/mfa'))
    expect(new URL(loc(res)!).pathname).toBe('/dashboard')
  })

  it('lets an un-enrolled user stay on /mfa/enroll (no loop)', async () => {
    single.mockResolvedValue({ data: { mfa_enrolled_at: null } })
    const res = await updateSession(req('/mfa/enroll'))
    expect(loc(res)).toBeNull()
  })

  it('lets an enrolled AAL1 user stay on /mfa (no loop)', async () => {
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1' } })
    const res = await updateSession(req('/mfa'))
    expect(loc(res)).toBeNull()
  })

  it('is inert when MFA_REQUIRED is off — un-enrolled user passes', async () => {
    mfaRequiredValue = false
    single.mockResolvedValue({ data: { mfa_enrolled_at: null } })
    const res = await updateSession(req('/dashboard'))
    expect(loc(res)).toBeNull()
  })
})
