import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

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
