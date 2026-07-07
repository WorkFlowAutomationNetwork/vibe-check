import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { resetUserMfa } from '@/lib/mfa/server'
import { logActivity } from '@/lib/activity'

// Confirms the *caller* is an admin (not the target user).
async function callerIsAdmin(): Promise<string | null> {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin === true ? user.id : null
}

// POST /api/admin/users/[userId]/reset-mfa
// Break-glass: an admin removes a user's TOTP factor + clears enrollment so the
// user is forced to re-enrol on next sign-in. For users locked out with no
// remaining backup codes.
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const adminId = await callerIsAdmin()
  if (!adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await resetUserMfa(params.userId)
    await logActivity({
      userId: adminId,
      eventType: 'admin_mfa_reset',
      payload: { target_user_id: params.userId },
    })
  } catch {
    return NextResponse.redirect(
      new URL(`/admin/users/${params.userId}?mfa=error`, request.url),
    )
  }

  return NextResponse.redirect(
    new URL(`/admin/users/${params.userId}?mfa=reset`, request.url),
  )
}
