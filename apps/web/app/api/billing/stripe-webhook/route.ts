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
      // Monitor is a recurring subscription with no fixed plan window (unlike
      // Starter's one-off 30-day unlock) -- clear any stale expiry, e.g. from
      // a prior Starter purchase before this customer upgraded.
      await supabase
        .from('profiles')
        .update({ plan, stripe_subscription_id: subscription.id, plan_expires_at: null })
        .eq('stripe_customer_id', subscription.customer as string)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      await supabase
        .from('profiles')
        .update({ plan: 'free', stripe_subscription_id: null, plan_expires_at: null })
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
        const update: { stripe_customer_id: string; plan?: 'starter' | 'monitor'; plan_expires_at?: string | null } = {
          stripe_customer_id: session.customer as string,
        }
        // One-time purchases (mode: 'payment', e.g. Starter) have no
        // subscription object, so customer.subscription.created never fires —
        // the plan has to be set here, from the metadata the checkout route
        // attached, instead of via resolvePlan()'s subscription price lookup.
        if (session.mode === 'payment') {
          const metadataPlan = session.metadata?.plan
          if (metadataPlan === 'starter' || metadataPlan === 'monitor') {
            update.plan = metadataPlan
            // Starter is a 30-day plan window, not a permanent unlock --
            // user_plan() reads this back as 'free' once it passes (see
            // migration 20260701000030). Re-purchasing simply resets the clock.
            update.plan_expires_at = metadataPlan === 'starter'
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : null
          }
        }
        await supabase.from('profiles').update(update).eq('id', userId)
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
