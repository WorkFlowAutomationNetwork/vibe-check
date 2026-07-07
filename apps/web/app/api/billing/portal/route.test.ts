import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUser = vi.fn()
const profileSingle = vi.fn()
const portalCreate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: profileSingle }) }) }),
  }),
}))
vi.mock('@/lib/stripe/client', () => ({
  stripe: { billingPortal: { sessions: { create: (...a: unknown[]) => portalCreate(...a) } } },
}))

import { GET } from './route'

const APP_URL = 'https://app.example.com'
const SUPABASE_URL = 'https://proj.supabase.co'

beforeEach(() => {
  vi.clearAllMocks()
  // The regression this guards: both fallback redirects once used
  // NEXT_PUBLIC_SUPABASE_URL as their base, sending users to a broken
  // destination on Supabase's domain. Set the two to distinct hosts so a
  // relapse is observable.
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  profileSingle.mockResolvedValue({ data: { stripe_customer_id: 'cus_123' } })
  portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session/abc' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/billing/portal', () => {
  it('redirects an unauthenticated user to sign-in on the app host, not Supabase', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    expect(location).toBe(`${APP_URL}/sign-in`)
    expect(location).not.toContain('supabase.co')
    expect(portalCreate).not.toHaveBeenCalled()
  })

  it('redirects to billing on the app host when the user has no Stripe customer', async () => {
    profileSingle.mockResolvedValue({ data: { stripe_customer_id: null } })
    const res = await GET()
    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    expect(location).toBe(`${APP_URL}/billing?error=no_subscription`)
    expect(location).not.toContain('supabase.co')
    expect(portalCreate).not.toHaveBeenCalled()
  })

  it('creates a portal session with the app-host return URL and redirects to it', async () => {
    const res = await GET()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://billing.stripe.com/session/abc')
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_123', return_url: `${APP_URL}/billing` }),
    )
  })
})
