import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// Only allow same-origin relative paths as a post-auth redirect target.
// Rejects absolute URLs, protocol-relative ("//evil") and backslash
// ("/\evil") values that browsers treat as off-origin redirects.
function safeNext(next: string | null): string {
  if (!next) return '/dashboard'
  if (next[0] !== '/' || next[1] === '/' || next[1] === '\\') return '/dashboard'
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}
