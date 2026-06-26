import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/vercel-webhook'

async function dispatchToScanner(payload: {
  scan_id: string
  url_id: string
  scan_type: string
  user_id: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.SCANNER_API_URL}/api/scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': process.env.SCANNER_INTERNAL_KEY ?? '',
      },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } },
) {
  const tokenHash = hashToken(params.token)
  const supabase = createServiceClient()

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, user_id')
    .eq('type', 'vercel')
    .eq('status', 'active')
    .eq('config->>token_hash', tokenHash)
    .maybeSingle()

  if (!integration) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  let rawBody: unknown = null
  try { rawBody = await request.json() } catch { /* ignore — just a trigger */ }

  await supabase
    .from('integrations')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', integration.id)

  await supabase
    .from('webhook_log')
    .insert({
      integration_id: integration.id,
      source: 'vercel',
      payload: rawBody ?? {},
      status: 'SCAN_QUEUED',
    })

  const { data: urls } = await supabase
    .from('urls')
    .select('id')
    .eq('user_id', integration.user_id)
    .eq('verified', true)
    .eq('monitoring_mode', 'continuous')
    .is('deleted_at', null)

  if (!urls?.length) {
    return NextResponse.json({ queued: 0 })
  }

  let queued = 0
  for (const url of urls) {
    const { data: active } = await supabase
      .from('scans')
      .select('id')
      .eq('url_id', url.id)
      .in('status', ['pending', 'running'])
      .maybeSingle()

    if (active) continue

    const { data: scan } = await supabase
      .from('scans')
      .insert({
        url_id: url.id,
        user_id: integration.user_id,
        scan_type: 'active',
        status: 'pending',
        triggered_by: 'webhook',
      })
      .select('id')
      .single()

    if (scan) {
      const dispatched = await dispatchToScanner({
        scan_id: scan.id,
        url_id: url.id,
        scan_type: 'active',
        user_id: integration.user_id,
      })
      if (dispatched) queued++
    }
  }

  return NextResponse.json({ queued })
}
