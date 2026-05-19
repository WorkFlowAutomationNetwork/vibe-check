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
      if (session.customer && session.customer_email) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: session.customer as string })
          .eq('email', session.customer_email)
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
