import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

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
