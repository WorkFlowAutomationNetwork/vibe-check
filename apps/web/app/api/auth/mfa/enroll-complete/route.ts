import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { issueRecoveryCodes, markEnrolled } from '@/lib/mfa/server'

/**
 * Called by the client after `mfa.challengeAndVerify` succeeds (which elevates
 * the session to AAL2). We re-check AAL2 server-side — proof the caller actually
 * verified a TOTP factor — then issue backup codes and mark enrollment complete.
 * Returns the plaintext codes exactly once.
 */
export async function POST() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'factor_not_verified' }, { status: 403 })
  }

  const codes = await issueRecoveryCodes(user.id)
  await markEnrolled(user.id)
  await logActivity({ userId: user.id, eventType: 'mfa_enrolled' })

  return NextResponse.json({ codes })
}
