import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe/client'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = headers().get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object
      const plan = resolvePlan(subscription.items.data[0]?.price.lookup_key ?? '')
      await supabase
        .from('profiles')
        .update({ plan, stripe_subscription_id: subscription.id })
        .eq('stripe_customer_id', subscription.customer as string)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      await supabase
        .from('profiles')
        .update({ plan: 'free', stripe_subscription_id: null })
        .eq('stripe_customer_id', subscription.customer as string)
      break
    }

    case 'checkout.session.completed': {
      const session = event.data.object
      // Link the Stripe customer to our internal user via client_reference_id,
      // which the Checkout Session must be created with (client_reference_id =
      // user.id). The previous code matched on `profiles.email` — a column that
      // does not exist on `profiles`, so the link silently never happened
      // (security review A4). Matching on the authoritative user id is robust
      // and not dependent on a mutable email.
      const userId = session.client_reference_id ?? session.metadata?.user_id
      if (session.customer && userId) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: session.customer as string })
          .eq('id', userId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}

function resolvePlan(lookupKey: string): 'free' | 'starter' | 'monitor' {
  if (lookupKey.includes('monitor')) return 'monitor'
  if (lookupKey.includes('starter')) return 'starter'
  return 'free'
}
