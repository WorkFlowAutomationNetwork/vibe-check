import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin(userId: string): Promise<boolean> {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin === true
}

// POST /api/admin/users/[userId]/send-reset
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const isAdmin = await assertAdmin(params.userId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  // Get user email
  const { data: authUser, error } = await service.auth.admin.getUserById(params.userId)
  if (error || !authUser?.user?.email) {
    return NextResponse.redirect(
      new URL(`/admin/users/${params.userId}?reset=error`, request.url),
    )
  }

  // Actually SEND the recovery email. `generateLink` only *generates* a link
  // and never delivers it — using it here meant admin "Send reset" was a no-op
  // (security review C5). `resetPasswordForEmail` triggers Supabase's SMTP to
  // deliver the email, matching the working self-service flow on /reset-password.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  const { error: sendError } = await service.auth.resetPasswordForEmail(
    authUser.user.email,
    { redirectTo: `${appUrl}/api/auth/callback?next=/settings` },
  )

  const status = sendError ? 'error' : 'sent'
  return NextResponse.redirect(
    new URL(`/admin/users/${params.userId}?reset=${status}`, request.url),
  )
}
