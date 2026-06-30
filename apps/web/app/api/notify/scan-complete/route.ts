import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/client'
import { scanCompleteEmail } from '@/lib/email/templates/scan-complete'
import { scanFailedEmail } from '@/lib/email/templates/scan-failed'

// Constant-time comparison of the shared internal key. Returns false on any
// length mismatch (timingSafeEqual throws on unequal-length buffers) so we
// never leak validity through early return / timing — matching the scanner
// side's hmac.compare_digest discipline.
function internalKeyValid(provided: string | null): boolean {
  const expected = process.env.SCANNER_INTERNAL_KEY
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

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
  if (!internalKeyValid(request.headers.get('x-internal-key'))) {
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
