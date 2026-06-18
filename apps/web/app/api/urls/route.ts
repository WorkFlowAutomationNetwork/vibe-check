import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

const CreateUrlSchema = z.object({
  url: z.string().url(),
})

const PLAN_URL_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  monitor: 5,
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = CreateUrlSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Normalize: lowercase hostname, strip trailing slash
  const parsed_url = new URL(parsed.data.url)
  const normalized = `${parsed_url.protocol}//${parsed_url.hostname}${parsed_url.pathname.replace(/\/$/, '') || ''}`

  // Check for duplicate FIRST — if they own this URL already, skip to verify rather than hitting the limit error
  const { data: existing } = await supabase
    .from('urls')
    .select('id, verification_token')
    .eq('user_id', user.id)
    .eq('url', normalized)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'URL already added', url_id: existing.id, verification_token: existing.verification_token },
      { status: 409 },
    )
  }

  // Check plan limit (admins bypass all limits)
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, is_admin')
    .eq('id', user.id)
    .single()

  const plan = profile?.plan ?? 'free'
  const isAdmin = profile?.is_admin ?? false

  if (!isAdmin) {
    const limit = PLAN_URL_LIMITS[plan] ?? 1

    const { count } = await supabase
      .from('urls')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)

    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: 'plan_limit_reached', limit, current: count },
        { status: 402 },
      )
    }
  }

  const verification_token = `vc-verify=${crypto.randomUUID()}`

  const { data: urlRow, error: insertError } = await supabase
    .from('urls')
    .insert({
      user_id: user.id,
      url: normalized,
      verification_token,
      monitoring_mode: 'one_off',
    })
    .select('id, url, verification_token')
    .single()

  if (insertError || !urlRow) {
    return NextResponse.json({ error: 'Failed to create URL' }, { status: 500 })
  }

  await logActivity({
    userId: user.id,
    eventType: 'url_added',
    urlId: urlRow.id,
    payload: { url: normalized },
  })

  return NextResponse.json(urlRow, { status: 201 })
}
