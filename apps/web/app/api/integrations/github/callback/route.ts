import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { verifyState, listInstallationRepos, STATE_COOKIE_NAME } from '@/lib/github/app'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? ''

// GitHub's post-install redirect carries `installation_id` but NOT our `state`,
// so we read the signed state back from the httpOnly cookie set at install time.
function readStateCookie(request: Request): string {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === STATE_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return ''
}

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const installationId = Number(searchParams.get('installation_id'))
  const state = readStateCookie(request)

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
  const res = NextResponse.redirect(dest, { status: 302 })
  // one-time state: clear the cookie now that it has been consumed.
  res.cookies.set(STATE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
