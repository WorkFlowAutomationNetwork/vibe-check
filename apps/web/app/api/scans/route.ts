import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { scanQueue } from '@/lib/redis/client'

const EnqueueSchema = z.object({
  url_id: z.string().uuid(),
  scan_type: z.enum(['passive', 'active', 'deep']),
})

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = EnqueueSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { url_id, scan_type } = parsed.data

  // Verify URL belongs to user and is verified
  const { data: url } = await supabase
    .from('urls')
    .select('id, verified')
    .eq('id', url_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!url) {
    return NextResponse.json({ error: 'URL not found' }, { status: 404 })
  }

  if (!url.verified) {
    return NextResponse.json({ error: 'URL not verified' }, { status: 403 })
  }

  // Check for duplicate active scan (DB partial index also enforces this)
  const { data: activeScan } = await supabase
    .from('scans')
    .select('id')
    .eq('url_id', url_id)
    .in('status', ['pending', 'running'])
    .maybeSingle()

  if (activeScan) {
    return NextResponse.json({ error: 'Scan already in progress' }, { status: 409 })
  }

  // Insert scan record
  const { data: scan, error: insertError } = await supabase
    .from('scans')
    .insert({
      url_id,
      user_id: user.id,
      scan_type,
      status: 'pending',
      triggered_by: 'manual',
    })
    .select('id')
    .single()

  if (insertError || !scan) {
    return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
  }

  // Enqueue to scanner service via BullMQ
  await scanQueue.add('run-scan', { scan_id: scan.id, url_id, scan_type, user_id: user.id })

  return NextResponse.json({ scan_id: scan.id }, { status: 202 })
}

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const scanId = searchParams.get('id')

  if (!scanId) {
    return NextResponse.json({ error: 'Missing scan id' }, { status: 400 })
  }

  const { data: scan } = await supabase
    .from('scans')
    .select('id, status, grade, score, completed_at')
    .eq('id', scanId)
    .eq('user_id', user.id)
    .single()

  if (!scan) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(scan)
}
