import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWebhook } from '@/lib/github/app'

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  if (!(await verifyWebhook(raw, signature))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: { action?: string; installation?: { id?: number } }
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const event = request.headers.get('x-github-event')
  const service = createServiceClient()
  const installationId = payload.installation?.id

  if (event === 'installation' && installationId) {
    const action = payload.action
    if (action === 'deleted' || action === 'suspend' || action === 'unsuspend') {
      const status = action === 'unsuspend' ? 'active' : action === 'suspend' ? 'suspended' : 'revoked'
      await service.from('github_installations').update({ status }).eq('installation_id', installationId)
    }
  }

  // installation_repositories add/remove and push handling land in later plans;
  // acknowledge everything else so GitHub does not retry.
  return NextResponse.json({ ok: true }, { status: 200 })
}
