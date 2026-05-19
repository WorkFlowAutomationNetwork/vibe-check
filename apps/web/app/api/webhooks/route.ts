import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { scanQueue } from '@/lib/redis/client'
import { createHash, timingSafeEqual } from 'crypto'

const DeployPayloadSchema = z.object({
  url: z.string().url().optional(),
  ref: z.string().optional(),
})

export async function POST(request: Request) {
  const authHeader = request.headers.get('x-vibe-check-key')
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing key' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const keyHash = createHash('sha256').update(authHeader).digest('hex')

  // Verify API key (simplified — full bcrypt check in auth layer)
  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .single()

  if (!apiKey) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = DeployPayloadSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Find URLs for this user that have monitoring enabled
  const { data: urls } = await supabase
    .from('urls')
    .select('id')
    .eq('user_id', apiKey.user_id)
    .eq('verified', true)
    .eq('monitoring_mode', 'continuous')
    .is('deleted_at', null)

  if (!urls?.length) {
    return NextResponse.json({ queued: 0 })
  }

  let queued = 0
  for (const url of urls) {
    // Skip if scan already running
    const { data: active } = await supabase
      .from('scans')
      .select('id')
      .eq('url_id', url.id)
      .in('status', ['pending', 'running'])
      .maybeSingle()

    if (active) continue

    const { data: scan } = await supabase
      .from('scans')
      .insert({ url_id: url.id, user_id: apiKey.user_id, scan_type: 'active', status: 'pending', triggered_by: 'webhook' })
      .select('id')
      .single()

    if (scan) {
      await scanQueue.add('run-scan', { scan_id: scan.id, url_id: url.id, scan_type: 'active', user_id: apiKey.user_id })
      queued++
    }
  }

  return NextResponse.json({ queued })
}
