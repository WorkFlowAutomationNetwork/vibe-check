import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/client'
import { waitlistEmail } from '@/lib/email/templates/waitlist'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

const Schema = z.object({ email: z.string().email() })

// Public, unauthenticated, and it sends email (Resend cost) — IP-throttle it.
const NOTIFY_MAX = 5
const NOTIFY_WINDOW_SECONDS = 60 * 60

export async function POST(request: Request) {
  const origin = new URL(request.url).origin

  const limit = await checkRateLimit({
    key: `notify:ip:${clientIp(request)}`,
    max: NOTIFY_MAX,
    windowSeconds: NOTIFY_WINDOW_SECONDS,
  })
  if (!limit.ok) {
    return NextResponse.redirect(new URL('/prelaunch?notify=rate_limited', origin), { status: 303 })
  }

  const form = await request.formData()
  const parsed = Schema.safeParse({ email: String(form.get('email') ?? '').trim() })

  if (!parsed.success) {
    return NextResponse.redirect(new URL('/prelaunch?notify=invalid', origin), { status: 303 })
  }

  const email = parsed.data.email.toLowerCase()
  const supabase = createServiceClient()
  const { error, data } = await supabase
    .from('waitlist')
    .upsert({ email, source: 'prelaunch' }, { onConflict: 'email', ignoreDuplicates: true })
    .select('email')
  if (error) {
    console.error('[prelaunch/notify] waitlist upsert failed:', error.message)
  }

  // data has rows only when a new row was inserted; duplicates are ignored and return empty
  if (!error && data && data.length > 0) {
    const { subject, html } = waitlistEmail(email)
    await sendEmail({ to: email, subject, html })
  }

  return NextResponse.redirect(new URL('/prelaunch?notify=ok', origin), { status: 303 })
}
