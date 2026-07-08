import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'
import { prelaunchGate } from '@/lib/prelaunch/gate'
import { mfaRequired } from '@/lib/mfa/config'

export async function updateSession(request: NextRequest) {
  const gated = await prelaunchGate(request)
  if (gated) return gated

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session — must not contain any logic between createServerClient and getUser
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtected =
    path.startsWith('/dashboard') ||
    // /report/[id]/public is publicly accessible; all other report paths need auth
    (path.startsWith('/report') && !path.endsWith('/public')) ||
    path.startsWith('/onboard') ||
    path.startsWith('/badge') ||
    path.startsWith('/repos') ||
    path.startsWith('/integrations') ||
    path.startsWith('/settings') ||
    path.startsWith('/billing') ||
    path.startsWith('/roadmap') ||
    path.startsWith('/admin')

  const isAuthPage = request.nextUrl.pathname === '/sign-in' ||
    request.nextUrl.pathname === '/sign-up'

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // --- Mandatory MFA gate (inert unless MFA_REQUIRED) ---
  // The /mfa and /mfa/enroll pages and /api/auth/mfa/* routes are reachable at
  // AAL1 (not in `isProtected`), so the gate can't loop. We compute MFA state
  // once and branch: force enrollment, force the challenge, or (on the gate
  // pages themselves) bounce an already-satisfied user back to the app.
  const onMfaPages = path === '/mfa' || path === '/mfa/enroll'
  if (mfaRequired && user && (isProtected || onMfaPages)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const { data: profile } = await supabase
      .from('profiles')
      .select('mfa_enrolled_at')
      .eq('id', user.id)
      .single()
    const enrolled = Boolean(profile?.mfa_enrolled_at)
    const isAal2 = aal?.currentLevel === 'aal2'

    if (onMfaPages) {
      if (enrolled && isAal2) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.search = ''
        return NextResponse.redirect(url)
      }
    } else if (!enrolled) {
      const url = request.nextUrl.clone()
      url.pathname = '/mfa/enroll'
      url.search = ''
      return NextResponse.redirect(url)
    } else if (!isAal2) {
      const url = request.nextUrl.clone()
      url.pathname = '/mfa'
      url.search = ''
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
