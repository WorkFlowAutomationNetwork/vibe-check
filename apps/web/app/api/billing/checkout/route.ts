import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'

const LOOKUP_KEYS: Record<string, string> = {
  starter: 'starter_one_off',
  monitor: 'monitor_monthly',
}

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { searchParams } = new URL(request.url)
  const plan = searchParams.get('plan')

  if (plan !== 'starter' && plan !== 'monitor') {
    return NextResponse.redirect(new URL('/billing?error=invalid_plan', appUrl))
  }

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/sign-in', appUrl))
  }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEYS[plan]], limit: 1 })
  const price = prices.data[0]
  if (!price) {
    return NextResponse.redirect(new URL('/billing?error=price_not_found', appUrl))
  }

  const session = await stripe.checkout.sessions.create({
    mode: plan === 'starter' ? 'payment' : 'subscription',
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan },
    customer: profile?.stripe_customer_id ?? undefined,
    customer_email: profile?.stripe_customer_id ? undefined : user.email,
    // payment-mode sessions don't create a Customer object unless told to —
    // the webhook needs session.customer to link the purchase back to this
    // user's profile, so without this a one-time payment leaves it null and
    // the webhook silently no-ops. subscription mode always creates one, so
    // this only applies (and is only valid) when there's no existing customer.
    ...(plan === 'starter' && !profile?.stripe_customer_id ? { customer_creation: 'always' as const } : {}),
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
  })

  if (!session.url) {
    return NextResponse.redirect(new URL('/billing?error=checkout_failed', appUrl))
  }

  return NextResponse.redirect(session.url)
}
