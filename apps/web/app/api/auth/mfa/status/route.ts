import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

/**
 * MFA status for the current user, for the settings panel. `mfa_recovery_codes`
 * is service-role-only (RLS-denied to the client), so the remaining-code count
 * has to come through here rather than a direct client query.
 */
export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('mfa_enrolled_at')
    .eq('id', user.id)
    .single()

  const enrolled = Boolean(profile?.mfa_enrolled_at)

  let backupCodesRemaining = 0
  if (enrolled) {
    const service = createServiceClient()
    const { count } = await service
      .from('mfa_recovery_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('used_at', null)
    backupCodesRemaining = count ?? 0
  }

  return NextResponse.json({
    enrolled,
    enrolledAt: profile?.mfa_enrolled_at ?? null,
    backupCodesRemaining,
  })
}
