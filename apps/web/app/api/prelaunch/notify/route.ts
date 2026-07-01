import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/client'
import { waitlistEmail } from '@/lib/email/templates/waitlist'

const Schema = z.object({ email: z.string().email() })

export async function POST(request: Request) {
  const origin = new URL(request.url).origin
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
