import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { signState, buildInstallUrl, STATE_COOKIE_NAME, STATE_COOKIE_MAX_AGE } from '@/lib/github/app'

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const state = signState({ userId: user.id })
  const res = NextResponse.redirect(buildInstallUrl(state), { status: 302 })
  // GitHub won't echo `state` back on the post-install redirect, so stash it in
  // an httpOnly cookie the callback can read. SameSite=Lax so it's sent on the
  // top-level GET navigation GitHub performs back to our callback.
  res.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_COOKIE_MAX_AGE,
  })
  return res
}
