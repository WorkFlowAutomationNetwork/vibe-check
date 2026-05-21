import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().optional(),
  plan: z.enum(['free', 'starter', 'monitor']).default('free'),
  is_admin: z.boolean().default(false),
})

async function assertAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { userId: user.id }
}

// GET /api/admin/users — list all users with profile data
export async function GET(request: NextRequest) {
  const guard = await assertAdmin()
  if (guard instanceof NextResponse) return guard

  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(100, parseInt(searchParams.get('per_page') ?? '20', 10))

  const service = createServiceClient()
  const { data: authData, error } = await service.auth.admin.listUsers({ page, perPage })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = authData?.users ?? []
  const userIds = users.map(u => u.id)

  const { data: profiles } = userIds.length
    ? await service
        .from('profiles')
        .select('id, plan, is_admin, name, stripe_customer_id, stripe_subscription_id')
        .in('id', userIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  const result = users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at,
    ...profileMap.get(u.id),
  }))

  return NextResponse.json({
    users: result,
    total: authData?.total ?? users.length,
    page,
    per_page: perPage,
  })
}

// POST /api/admin/users — create a new user account
export async function POST(request: NextRequest) {
  const guard = await assertAdmin()
  if (guard instanceof NextResponse) return guard

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { email, password, name, plan, is_admin } = parsed.data
  const service = createServiceClient()

  // Create the auth user
  const { data: newUser, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !newUser.user) {
    return NextResponse.json(
      { error: createError?.message ?? 'Failed to create user' },
      { status: 500 },
    )
  }

  // Update the auto-created profile with plan, name, is_admin
  const { error: profileError } = await service
    .from('profiles')
    .update({ plan, name: name ?? null, is_admin })
    .eq('id', newUser.user.id)

  if (profileError) {
    // User created but profile update failed — log and continue
    console.error('[admin] profile update failed after user creation', profileError)
  }

  return NextResponse.json({ user: { id: newUser.user.id, email } }, { status: 201 })
}
