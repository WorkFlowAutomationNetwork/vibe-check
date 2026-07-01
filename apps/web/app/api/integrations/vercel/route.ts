import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { generateWebhookToken, hashToken } from '@/lib/vercel-webhook'

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: entitlements } = await supabase
    .from('my_entitlements')
    .select('can_integrations')
    .single()
  if (!entitlements?.can_integrations) {
    return NextResponse.json({ error: 'requires_monitor' }, { status: 403 })
  }

  const token = generateWebhookToken()
  const tokenHash = hashToken(token)

  const service = createServiceClient()
  const { error } = await service
    .from('integrations')
    .upsert(
      {
        user_id: user.id,
        type: 'vercel',
        status: 'active',
        config: { token_hash: tokenHash, created_at: new Date().toISOString() },
      },
      { onConflict: 'user_id,type' },
    )

  if (error) return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 })

  const origin = new URL(request.url).origin
  const webhookUrl = `${origin}/api/webhooks/vercel/${token}`
  return NextResponse.json({ webhookUrl })
}

export async function DELETE(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service
    .from('integrations')
    .update({ status: 'disconnected' })
    .eq('user_id', user.id)
    .eq('type', 'vercel')

  return NextResponse.json({ ok: true })
}
