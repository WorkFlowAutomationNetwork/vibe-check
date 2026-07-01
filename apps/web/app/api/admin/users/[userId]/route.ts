import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const UpdateUserSchema = z.object({
  name: z.string().optional(),
  plan: z.enum(['free', 'starter', 'monitor']).optional(),
  is_admin: z.union([z.boolean(), z.string()]).transform(v =>
    typeof v === 'string' ? v === 'true' : v,
  ).optional(),
  _method: z.string().optional(), // form method override
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

// GET /api/admin/users/[userId] — fetch single user
export async function GET(
  _request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await assertAdmin()
  if (guard instanceof NextResponse) return guard

  const service = createServiceClient()

  const [{ data: authUser, error }, { data: profile }] = await Promise.all([
    service.auth.admin.getUserById(params.userId),
    service.from('profiles').select('*').eq('id', params.userId).single(),
  ])

  if (error || !authUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ user: { ...authUser.user, profile } })
}

// PATCH /api/admin/users/[userId] — update plan, name, admin status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await assertAdmin()
  if (guard instanceof NextResponse) return guard

  let body: unknown
  const ct = request.headers.get('content-type') ?? ''

  if (ct.includes('application/json')) {
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
  } else {
    // Handle form submission
    const form = await request.formData()
    body = Object.fromEntries(form.entries())
  }

  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { name, plan, is_admin } = parsed.data
  const service = createServiceClient()

  // Build profile update
  const profileUpdate: Record<string, unknown> = {}
  if (name !== undefined) profileUpdate.name = name
  if (plan !== undefined) {
    profileUpdate.plan = plan
    // Mirror the checkout webhook: a manually-granted starter plan still
    // expires in 30 days (user_plan() reads it back as 'free' after, per
    // migration 20260701000030); other plans have no fixed window.
    profileUpdate.plan_expires_at = plan === 'starter'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null
  }
  if (is_admin !== undefined) profileUpdate.is_admin = is_admin

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await service
      .from('profiles')
      .update(profileUpdate)
      .eq('id', params.userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Redirect back to user detail page if this was a form submission
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    return NextResponse.redirect(
      new URL(`/admin/users/${params.userId}`, request.url),
    )
  }

  return NextResponse.json({ ok: true })
}

// POST /api/admin/users/[userId] — handles form method overrides (_method=DELETE)
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await assertAdmin()
  if (guard instanceof NextResponse) return guard

  const form = await request.formData()
  const method = form.get('_method')

  if (method === 'DELETE') {
    return handleDelete(request, params.userId)
  }

  // Otherwise treat as PATCH (plan/name update from form)
  const body = Object.fromEntries(form.entries())
  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.redirect(new URL(`/admin/users/${params.userId}`, request.url))
  }

  const service = createServiceClient()
  const { name, plan, is_admin } = parsed.data

  const profileUpdate: Record<string, unknown> = {}
  if (name !== undefined) profileUpdate.name = name
  if (plan !== undefined) {
    profileUpdate.plan = plan
    profileUpdate.plan_expires_at = plan === 'starter'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null
  }
  if (is_admin !== undefined) profileUpdate.is_admin = is_admin

  if (Object.keys(profileUpdate).length > 0) {
    await service.from('profiles').update(profileUpdate).eq('id', params.userId)
  }

  return NextResponse.redirect(new URL(`/admin/users/${params.userId}`, request.url))
}

// DELETE /api/admin/users/[userId] — permanently delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await assertAdmin()
  if (guard instanceof NextResponse) return guard
  return handleDelete(request, params.userId)
}

async function handleDelete(request: NextRequest, userId: string) {
  const service = createServiceClient()

  // Prevent self-deletion
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id === userId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.redirect(new URL('/admin/users', request.url))
}
