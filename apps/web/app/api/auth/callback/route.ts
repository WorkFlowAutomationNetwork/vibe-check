import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/client'
import { welcomeEmail } from '@/lib/email/templates/welcome'

function safeNext(next: string | null): string {
  if (!next) return '/dashboard'
  if (next[0] !== '/' || next[1] === '/' || next[1] === '\\') return '/dashboard'
  return next
}

function isNewUser(createdAt: string | undefined): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < 5 * 60 * 1000
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = createServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data.user
      if (user?.email && isNewUser(user.created_at)) {
        const { subject, html } = welcomeEmail(user.email)
        void sendEmail({ to: user.email, subject, html })
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}
