// One-off script for the 2026-07 repricing ($9 -> $15 Starter, $19 -> $35 Monitor).
//
// Stripe Price objects are immutable once created -- you can't edit unit_amount
// on an existing price, so this creates new Price objects at the new amounts,
// moves each lookup_key over (a lookup_key can only be active on one price at
// a time), and archives the old prices. /api/billing/checkout looks prices up
// by these same lookup_keys, so no app code needs to change once this runs.
//
// Usage (test mode only -- uses whatever STRIPE_SECRET_KEY is set):
//   STRIPE_SECRET_KEY=sk_test_... node apps/web/scripts/update-stripe-prices.cjs
//
// Safe to re-run: if a price already has the target unit_amount under the
// expected lookup_key, it's left alone.

const Stripe = require('stripe')

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) {
  console.error('STRIPE_SECRET_KEY is not set.')
  process.exit(1)
}
if (KEY.startsWith('sk_live_')) {
  console.error('Refusing to run against a live-mode key. This script is for test mode only.')
  process.exit(1)
}

const stripe = new Stripe(KEY, { apiVersion: '2025-02-24.acacia' })

const TARGETS = [
  { lookupKey: 'starter_one_off', nickname: 'Starter (one-off)', unitAmount: 1500, recurring: null },
  { lookupKey: 'monitor_monthly', nickname: 'Monitor (monthly)', unitAmount: 3500, recurring: { interval: 'month' } },
]

async function main() {
  for (const target of TARGETS) {
    const existing = await stripe.prices.list({ lookup_keys: [target.lookupKey], limit: 1 })
    const current = existing.data[0]

    if (current && current.unit_amount === target.unitAmount) {
      console.log(`[skip] ${target.lookupKey} already at ${target.unitAmount}`)
      continue
    }

    if (!current) {
      console.error(`[error] no existing price found for lookup_key=${target.lookupKey} -- create the product/price manually first`)
      continue
    }

    const productId = typeof current.product === 'string' ? current.product : current.product.id

    // Release the lookup_key from the old price before assigning it to the new one.
    // If anything below fails, restore it immediately so checkout (which resolves
    // prices by lookup_key) never sees a window with no active price for this key.
    await stripe.prices.update(current.id, { lookup_key: null })

    let newPrice
    try {
      newPrice = await stripe.prices.create({
        product: productId,
        currency: current.currency,
        unit_amount: target.unitAmount,
        nickname: target.nickname,
        lookup_key: target.lookupKey,
        ...(target.recurring ? { recurring: target.recurring } : {}),
      })
    } catch (err) {
      await stripe.prices.update(current.id, { lookup_key: target.lookupKey })
      console.error(`[error] failed to create new price for ${target.lookupKey}, restored lookup_key on ${current.id}:`, err.message)
      continue
    }

    await stripe.prices.update(current.id, { active: false })

    console.log(`[updated] ${target.lookupKey}: ${current.id} ($${current.unit_amount / 100}) -> ${newPrice.id} ($${target.unitAmount / 100})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
