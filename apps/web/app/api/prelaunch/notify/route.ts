import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'

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
  const { error } = await supabase
    .from('waitlist')
    .upsert({ email, source: 'prelaunch' }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) {
    console.error('[prelaunch/notify] waitlist upsert failed:', error.message)
  }

  return NextResponse.redirect(new URL('/prelaunch?notify=ok', origin), { status: 303 })
}
