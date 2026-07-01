import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (typeof body?.public_report_enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { data: urlRow, error: updateError } = await supabase
    .from('urls')
    .update({ public_report_enabled: body.public_report_enabled })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id, public_report_enabled')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
  if (!urlRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  await logActivity({
    userId: user.id,
    eventType: 'url_public_report_toggled',
    payload: { url_id: urlRow.id, public_report_enabled: urlRow.public_report_enabled },
  })

  return NextResponse.json(urlRow, { status: 200 })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Must exist, be owned by this user, and not already soft-deleted.
  const { data: urlRow } = await supabase
    .from('urls')
    .select('id, url')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!urlRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Any scan (any status) blocks removal.
  const { count } = await supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('url_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'url_has_scans' }, { status: 409 })
  }

  const { error: deleteError } = await supabase
    .from('urls')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  // Row is gone — log the URL string in payload, no url_id (FK would dangle).
  await logActivity({
    userId: user.id,
    eventType: 'url_removed',
    payload: { url: urlRow.url },
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
