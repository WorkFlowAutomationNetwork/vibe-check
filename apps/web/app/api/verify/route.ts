import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const VerifySchema = z.object({
  url_id: z.string().uuid(),
  method: z.enum(['dns', 'file', 'meta']),
})

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = VerifySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { url_id, method } = parsed.data

  const { data: urlRow } = await supabase
    .from('urls')
    .select('id, url, verification_token, verified')
    .eq('id', url_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!urlRow) {
    return NextResponse.json({ error: 'URL not found' }, { status: 404 })
  }

  if (urlRow.verified) {
    return NextResponse.json({ verified: true })
  }

  // Verification logic is intentionally left as a stub — implemented in the
  // ownership verification task (build step 7).
  return NextResponse.json(
    { error: 'Verification check not yet implemented', method, token: urlRow.verification_token },
    { status: 501 },
  )
}
