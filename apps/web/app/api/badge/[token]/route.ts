import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: badge } = await supabase
    .from('badges')
    .select('id, status, expires_at, url_id, scan_id')
    .eq('public_token', params.token)
    .eq('status', 'active')
    .single()

  if (!badge) {
    return NextResponse.json({ valid: false }, { status: 404 })
  }

  const expired = badge.expires_at && new Date(badge.expires_at) < new Date()
  if (expired) {
    return NextResponse.json({ valid: false, reason: 'expired' }, { status: 200 })
  }

  return NextResponse.json({ valid: true, badge_id: badge.id, scan_id: badge.scan_id })
}
