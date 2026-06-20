import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { verifyState, listInstallationRepos } from '@/lib/github/app'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? ''

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const installationId = Number(searchParams.get('installation_id'))
  const state = searchParams.get('state') ?? ''

  const verified = verifyState(state)
  if (!verified || verified.userId !== user.id || !Number.isFinite(installationId) || installationId <= 0) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  const repos = await listInstallationRepos(installationId)

  const service = createServiceClient()
  const { data: inst, error: instErr } = await service
    .from('github_installations')
    .upsert(
      {
        user_id: user.id,
        installation_id: installationId,
        account_login: repos[0]?.full_name.split('/')[0] ?? 'unknown',
        account_type: 'user',
        status: 'active',
      },
      { onConflict: 'installation_id' },
    )
    .select()
    .single()

  if (instErr || !inst) {
    return NextResponse.json({ error: 'Could not record installation' }, { status: 500 })
  }

  if (repos.length > 0) {
    await service.from('repos').upsert(
      repos.map(r => ({
        installation_id: inst.id,
        user_id: user.id,
        github_repo_id: r.github_repo_id,
        full_name: r.full_name,
        default_branch: r.default_branch,
        status: 'active',
      })),
      { onConflict: 'installation_id,github_repo_id' },
    )
  }

  // redirect() needs an absolute URL; prefer the configured app URL, else
  // derive the origin from the incoming request.
  const dest = new URL('/integrations', APP || request.url)
  return NextResponse.redirect(dest, { status: 302 })
}
