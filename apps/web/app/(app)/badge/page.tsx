import { notFound } from 'next/navigation'
import BadgeClient from '@/components/badge/BadgeClient'
import { createServerClient } from '@/lib/supabase/server'
import '../app.css'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vibe-check.dev'

export default async function BadgePage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Get user's URL IDs, then find their active badge
  const { data: urls } = await supabase
    .from('urls')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)

  const urlIds = (urls ?? []).map(u => u.id)

  if (urlIds.length === 0) {
    return <BadgeClient badge={null} appUrl={APP_URL} />
  }

  const { data: badge } = await supabase
    .from('badges')
    .select('*')
    .in('url_id', urlIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!badge) {
    return <BadgeClient badge={null} appUrl={APP_URL} />
  }

  const [{ data: scan }, { data: urlRow }] = await Promise.all([
    supabase.from('scans').select('grade, completed_at').eq('id', badge.scan_id).single(),
    supabase.from('urls').select('url').eq('id', badge.url_id).single(),
  ])

  const badgeWithRelations = {
    ...badge,
    grade: scan?.grade ?? null,
    completed_at: scan?.completed_at ?? null,
    url: urlRow?.url ?? null,
  }

  return <BadgeClient badge={badgeWithRelations} appUrl={APP_URL} />
}
