import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const EnqueueSchema = z.object({ repo_id: z.string().uuid() })

async function dispatchToScanner(payload: {
  repo_scan_id: string
  repo_id: string
  user_id: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.SCANNER_API_URL}/api/repo-scans`, {
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

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = EnqueueSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { repo_id } = parsed.data

  const { data: repo } = await supabase
    .from('repos')
    .select('id, status, last_scanned_sha')
    .eq('id', repo_id)
    .eq('user_id', user.id)
    .single()

  if (!repo || repo.status !== 'active') {
    return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
  }

  const { data: activeScan } = await supabase
    .from('repo_scans')
    .select('id')
    .eq('repo_id', repo_id)
    .in('status', ['pending', 'running'])
    .maybeSingle()

  if (activeScan) {
    return NextResponse.json(
      { error: 'Scan already in progress', repo_scan_id: activeScan.id },
      { status: 409 },
    )
  }

  const mode = repo.last_scanned_sha ? 'incremental' : 'full'

  const { data: scan, error: insertError } = await supabase
    .from('repo_scans')
    .insert({
      repo_id,
      user_id: user.id,
      mode,
      status: 'pending',
      triggered_by: 'manual',
    })
    .select('id')
    .single()

  if (insertError || !scan) {
    return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
  }

  const dispatched = await dispatchToScanner({
    repo_scan_id: scan.id,
    repo_id,
    user_id: user.id,
  })

  if (!dispatched) {
    await supabase.from('repo_scans').delete().eq('id', scan.id)
    return NextResponse.json({ error: 'Scanner service unavailable' }, { status: 502 })
  }

  return NextResponse.json({ repo_scan_id: scan.id }, { status: 202 })
}

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing scan id' }, { status: 400 })

  const { data: scan } = await supabase
    .from('repo_scans')
    .select('id, status, mode, secrets_found, completed_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(scan)
}
