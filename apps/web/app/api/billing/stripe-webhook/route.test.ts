import { describe, it, expect, vi, beforeEach } from 'vitest'

let signatureValue: string | null = 'sig_valid'
const constructEvent = vi.fn()
const updateCalls: Array<{ payload: Record<string, unknown>; col: string; val: unknown }> = []

vi.mock('next/headers', () => ({
  headers: () => ({ get: (k: string) => (k === 'stripe-signature' ? signatureValue : null) }),
}))
vi.mock('@/lib/stripe/client', () => ({
  stripe: { webhooks: { constructEvent: (...a: unknown[]) => constructEvent(...a) } },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          updateCalls.push({ payload, col, val })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }),
}))

import { POST } from './route'

function call() {
  return POST(new Request('http://localhost/api/billing/stripe-webhook', { method: 'POST', body: '{}' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  updateCalls.length = 0
  signatureValue = 'sig_valid'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
})

describe('POST /api/billing/stripe-webhook', () => {
  it('returns 400 when the stripe-signature header is missing', async () => {
    signatureValue = null
    const res = await call()
    expect(res.status).toBe(400)
    expect(constructEvent).not.toHaveBeenCalled()
  })

  it('returns 400 when signature verification throws', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig')
    })
    const res = await call()
    expect(res.status).toBe(400)
    expect(updateCalls).toHaveLength(0)
  })

  it('links customer and sets a 30-day expiry on a starter one-off checkout', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-1',
          customer: 'cus_1',
          mode: 'payment',
          metadata: { plan: 'starter' },
        },
      },
    })
    const res = await call()
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    const { payload, col, val } = updateCalls[0]
    expect(col).toBe('id')
    expect(val).toBe('user-1')
    expect(payload.stripe_customer_id).toBe('cus_1')
    expect(payload.plan).toBe('starter')
    expect(typeof payload.plan_expires_at).toBe('string')
    // ~30 days out
    const ms = new Date(payload.plan_expires_at as string).getTime() - Date.now()
    expect(ms).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
    expect(ms).toBeLessThan(31 * 24 * 60 * 60 * 1000)
  })

  it('sets the monitor plan and clears expiry on subscription.updated', async () => {
    constructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_9',
          items: { data: [{ price: { lookup_key: 'monitor_monthly' } }] },
        },
      },
    })
    await call()
    expect(updateCalls).toHaveLength(1)
    const { payload, col, val } = updateCalls[0]
    expect(col).toBe('stripe_customer_id')
    expect(val).toBe('cus_9')
    expect(payload).toEqual({ plan: 'monitor', stripe_subscription_id: 'sub_1', plan_expires_at: null })
  })

  it('downgrades to free on subscription.deleted', async () => {
    constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_9', items: { data: [] } } },
    })
    await call()
    expect(updateCalls).toHaveLength(1)
    const { payload, col, val } = updateCalls[0]
    expect(col).toBe('stripe_customer_id')
    expect(val).toBe('cus_9')
    expect(payload).toEqual({ plan: 'free', stripe_subscription_id: null, plan_expires_at: null })
  })

  it('ignores unhandled event types without writing', async () => {
    constructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: {} } })
    const res = await call()
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(0)
  })
})
