import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  verifyState,
  exchangeCodeForUserToken,
  listUserInstallations,
  listInstallationRepos,
  signState,
  buildInstallUrl,
  STATE_COOKIE_NAME,
  STATE_COOKIE_MAX_AGE,
} from '@/lib/github/app'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? ''

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }

// GitHub's redirect carries `code` + (sometimes) installation_id, but NOT our
// `state`, so we read the signed state back from the httpOnly cookie set at
// authorize time.
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
  const code = searchParams.get('code') ?? ''
  const state = readStateCookie(request)

  const verified = verifyState(state)
  if (!verified || verified.userId !== user.id || !code) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  try {
    // Exchange the OAuth code for an app-scoped user token, then enumerate the
    // installations of this app the user can access. This works whether or not
    // the app was already installed, unlike depending on the post-install redirect.
    const userToken = await exchangeCodeForUserToken(code)
    const installations = await listUserInstallations(userToken)

    // Authorized but not installed on any repo yet → send them to actually
    // install. After install (OAuth-during-install on), GitHub returns here with
    // a code and /user/installations will then be non-empty.
    if (installations.length === 0) {
      const res = NextResponse.redirect(buildInstallUrl(signState({ userId: user.id })), {
        status: 302,
      })
      res.cookies.set(STATE_COOKIE_NAME, signState({ userId: user.id }), {
        ...COOKIE_OPTS,
        maxAge: STATE_COOKIE_MAX_AGE,
      })
      return res
    }

    const service = createServiceClient()
    for (const inst of installations) {
      const { data: instRow, error: instErr } = await service
        .from('github_installations')
        .upsert(
          {
            user_id: user.id,
            installation_id: inst.installation_id,
            account_login: inst.account_login,
            account_type: inst.account_type,
            status: 'active',
          },
          { onConflict: 'installation_id' },
        )
        .select()
        .single()

      if (instErr || !instRow) {
        throw new Error(`installation upsert failed: ${instErr?.message ?? 'no row returned'}`)
      }

      const repos = await listInstallationRepos(inst.installation_id)
      if (repos.length > 0) {
        await service.from('repos').upsert(
          repos.map((r) => ({
            installation_id: instRow.id,
            user_id: user.id,
            github_repo_id: r.github_repo_id,
            full_name: r.full_name,
            default_branch: r.default_branch,
            status: 'active',
          })),
          { onConflict: 'installation_id,github_repo_id' },
        )
      }
    }

    // redirect() needs an absolute URL; prefer the configured app URL, else
    // derive the origin from the incoming request.
    const dest = new URL('/integrations', APP || request.url)
    const res = NextResponse.redirect(dest, { status: 302 })
    // one-time state: clear the cookie now that it has been consumed.
    res.cookies.set(STATE_COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 })
    return res
  } catch (err) {
    // Don't 500 the user — log the real cause + which env vars are present at
    // runtime, then bounce back to /integrations with an error flag.
    console.error('[gh-callback] failed', {
      message: err instanceof Error ? err.message : String(err),
      hasClientId: !!process.env.GITHUB_APP_CLIENT_ID,
      hasClientSecret: !!process.env.GITHUB_APP_CLIENT_SECRET,
      hasAppId: !!process.env.GITHUB_APP_ID,
      hasPrivateKey: !!process.env.GITHUB_APP_PRIVATE_KEY,
    })
    const dest = new URL('/integrations?gh_error=1', APP || request.url)
    const res = NextResponse.redirect(dest, { status: 302 })
    res.cookies.set(STATE_COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 })
    return res
  }
}
