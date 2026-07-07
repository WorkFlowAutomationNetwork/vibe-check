import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUser = vi.fn()
const profileSingle = vi.fn()
const pricesList = vi.fn()
const checkoutCreate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser } }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: profileSingle }) }) }),
  }),
}))
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    prices: { list: (...a: unknown[]) => pricesList(...a) },
    checkout: { sessions: { create: (...a: unknown[]) => checkoutCreate(...a) } },
  },
}))

import { GET } from './route'

const APP_URL = 'https://app.example.com'

function call(plan?: string) {
  const qs = plan === undefined ? '' : `?plan=${plan}`
  return GET(new Request(`http://localhost/api/billing/checkout${qs}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL)
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@example.com' } } })
  profileSingle.mockResolvedValue({ data: { stripe_customer_id: null } })
  pricesList.mockResolvedValue({ data: [{ id: 'price_abc' }] })
  checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/session_abc' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/billing/checkout', () => {
  it('rejects an invalid plan before touching auth or Stripe', async () => {
    const res = await call('enterprise')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/billing?error=invalid_plan`)
    expect(checkoutCreate).not.toHaveBeenCalled()
  })

  it('redirects an unauthenticated user to sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call('starter')
    expect(res.headers.get('location')).toBe(`${APP_URL}/sign-in`)
    expect(checkoutCreate).not.toHaveBeenCalled()
  })

  it('redirects with price_not_found when the lookup key resolves nothing', async () => {
    pricesList.mockResolvedValue({ data: [] })
    const res = await call('starter')
    expect(res.headers.get('location')).toBe(`${APP_URL}/billing?error=price_not_found`)
    expect(checkoutCreate).not.toHaveBeenCalled()
  })

  it('creates a one-off payment session for starter with customer_creation:always', async () => {
    const res = await call('starter')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://checkout.stripe.com/c/session_abc')
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        client_reference_id: 'user-1',
        customer_creation: 'always',
        metadata: { user_id: 'user-1', plan: 'starter' },
      }),
    )
  })

  it('creates a subscription session for monitor (no customer_creation)', async () => {
    const res = await call('monitor')
    expect(res.headers.get('location')).toBe('https://checkout.stripe.com/c/session_abc')
    const arg = checkoutCreate.mock.calls[0][0] as Record<string, unknown>
    expect(arg.mode).toBe('subscription')
    expect(arg).not.toHaveProperty('customer_creation')
  })

  it('reuses an existing Stripe customer instead of customer_creation', async () => {
    profileSingle.mockResolvedValue({ data: { stripe_customer_id: 'cus_existing' } })
    await call('starter')
    const arg = checkoutCreate.mock.calls[0][0] as Record<string, unknown>
    expect(arg.customer).toBe('cus_existing')
    expect(arg).not.toHaveProperty('customer_creation')
    expect(arg.customer_email).toBeUndefined()
  })
})
