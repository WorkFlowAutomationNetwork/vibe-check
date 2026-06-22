import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { signState, buildAuthorizeUrl, STATE_COOKIE_NAME, STATE_COOKIE_MAX_AGE } from '@/lib/github/app'

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const state = signState({ userId: user.id })
  // Enter via the OAuth authorize URL: it always redirects back to our callback
  // with code+state (whether or not the app is already installed), unlike
  // installations/new which dead-ends on the configure page for returning users.
  const res = NextResponse.redirect(buildAuthorizeUrl(state), { status: 302 })
  // GitHub won't echo `state` back, so stash it in an httpOnly cookie the
  // callback reads. SameSite=Lax so it's sent on the top-level GET navigation
  // GitHub performs back to our callback.
  res.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_COOKIE_MAX_AGE,
  })
  return res
}
