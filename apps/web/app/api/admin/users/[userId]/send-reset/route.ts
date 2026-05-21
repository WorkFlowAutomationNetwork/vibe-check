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
    return NextResponse.redirect(new URL(`/admin/users/${params.userId}`, request.url))
  }

  // Send password reset email via Supabase (generates a link)
  await service.auth.admin.generateLink({
    type: 'recovery',
    email: authUser.user.email,
  })

  return NextResponse.redirect(new URL(`/admin/users/${params.userId}`, request.url))
}
