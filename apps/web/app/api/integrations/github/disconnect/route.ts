import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { deleteInstallation } from '@/lib/github/app'

const Schema = z.object({ installation_id: z.coerce.number().int().positive() })

// The integrations page Disconnect button is a plain HTML <form> (form-encoded),
// while tests/clients may POST JSON — accept either.
async function readBody(request: Request): Promise<{ data: unknown; isJson: boolean }> {
  const ct = request.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    return { data: await request.json().catch(() => ({})), isJson: true }
  }
  const form = await request.formData().catch(() => null)
  return { data: form ? { installation_id: form.get('installation_id') } : {}, isJson: false }
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: body, isJson } = await readBody(request)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'installation_id required' }, { status: 422 })

  const service = createServiceClient()

  // Verify the installation belongs to this user BEFORE touching GitHub —
  // deleteInstallation() uses the app JWT (authority over every installation),
  // so without this an authed user could uninstall someone else's by ID (IDOR).
  const { data: owned } = await service
    .from('github_installations')
    .select('installation_id')
    .eq('user_id', user.id)
    .eq('installation_id', parsed.data.installation_id)
    .maybeSingle()

  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Best-effort: actually uninstall the app so read access is revoked, not just
  // hidden. If GitHub is unreachable we still revoke locally below; the webhook
  // reconciles if the user later uninstalls from GitHub directly.
  try {
    await deleteInstallation(parsed.data.installation_id)
  } catch {
    // swallow — local revoke still applies
  }

  await service
    .from('github_installations')
    .update({ status: 'revoked' })
    .eq('user_id', user.id)
    .eq('installation_id', parsed.data.installation_id)

  // repos carries user_id; mark this user's active repos as removed.
  await service
    .from('repos')
    .update({ status: 'removed' })
    .eq('user_id', user.id)
    .eq('status', 'active')

  // A browser <form> submit gets a redirect back to the page; API/JSON callers
  // get JSON.
  if (!isJson) {
    return NextResponse.redirect(new URL('/integrations', request.url), { status: 303 })
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}
