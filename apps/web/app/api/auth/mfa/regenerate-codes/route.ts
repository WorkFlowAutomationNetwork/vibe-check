import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { issueRecoveryCodes } from '@/lib/mfa/server'

/**
 * Regenerate backup codes from the settings page. Requires an AAL2 session (the
 * user has satisfied MFA this session), so a stolen AAL1 session can't rotate
 * someone's codes. Invalidates the old codes and returns a fresh set once.
 */
export async function POST() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'aal2_required' }, { status: 403 })
  }

  const codes = await issueRecoveryCodes(user.id)
  await logActivity({ userId: user.id, eventType: 'mfa_codes_regenerated' })

  return NextResponse.json({ codes })
}
