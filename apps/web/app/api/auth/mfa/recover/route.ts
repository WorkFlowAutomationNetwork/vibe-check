import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { checkRateLimit } from '@/lib/rate-limit'
import { consumeRecoveryCode, resetUserMfa } from '@/lib/mfa/server'

const RecoverSchema = z.object({
  code: z.string().min(1).max(64),
})

// Backup-code guessing must be expensive. 8 codes exist; cap attempts hard.
const RECOVER_MAX = 5
const RECOVER_WINDOW_SECONDS = 300

/**
 * "Lost your device" recovery. From a valid (AAL1) password session, a correct
 * backup code deletes the user's TOTP factor and clears enrollment, so the
 * middleware forces re-enrollment. It never grants AAL2 directly — it resets,
 * it does not bypass.
 */
export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await checkRateLimit({
    key: `mfa-recover:user:${user.id}`,
    max: RECOVER_MAX,
    windowSeconds: RECOVER_WINDOW_SECONDS,
  })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const parsed = RecoverSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 422 })
  }

  const matched = await consumeRecoveryCode(user.id, parsed.data.code)
  if (!matched) {
    // Generic — don't reveal whether the code existed or was already used.
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  await resetUserMfa(user.id)
  await logActivity({ userId: user.id, eventType: 'mfa_recovered' })

  return NextResponse.json({ ok: true })
}
