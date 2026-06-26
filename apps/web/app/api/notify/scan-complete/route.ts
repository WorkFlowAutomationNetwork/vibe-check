import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/client'
import { scanCompleteEmail } from '@/lib/email/templates/scan-complete'
import { scanFailedEmail } from '@/lib/email/templates/scan-failed'

const NotifySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    scan_id: z.string().uuid(),
    user_id: z.string().uuid(),
    url: z.string().url(),
    grade: z.string().min(1).max(1),
    has_critical: z.boolean(),
  }),
  z.object({
    status: z.literal('failed'),
    scan_id: z.string().uuid(),
    user_id: z.string().uuid(),
    url: z.string().url(),
  }),
])

export async function POST(request: Request) {
  const key = request.headers.get('x-internal-key')
  if (!key || key !== process.env.SCANNER_INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = NotifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { user_id, url } = parsed.data

  try {
    const supabase = createServiceClient()
    const { data } = await supabase.auth.admin.getUserById(user_id)
    const email = data.user?.email

    if (email) {
      if (parsed.data.status === 'completed') {
        const { scan_id, grade, has_critical } = parsed.data
        const { subject, html } = scanCompleteEmail({ url, grade, scanId: scan_id, hasCritical: has_critical })
        await sendEmail({ to: email, subject, html })
      } else {
        const { subject, html } = scanFailedEmail(url)
        await sendEmail({ to: email, subject, html })
      }
    }
  } catch {
    // Supabase or send failure — email is best-effort, never fail the scanner
  }

  return NextResponse.json({ ok: true })
}
