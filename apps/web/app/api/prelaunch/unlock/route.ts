import { NextResponse } from 'next/server'
import { COOKIE_NAME, getConfiguredPassword, constantTimeEqual, signToken } from '@/lib/prelaunch/gate'

export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  const form = await request.formData()
  const password = String(form.get('password') ?? '')
  const configured = getConfiguredPassword()

  if (!configured || !constantTimeEqual(password, configured)) {
    return NextResponse.redirect(new URL('/prelaunch?error=1', origin), { status: 303 })
  }

  const token = await signToken(configured)
  const res = NextResponse.redirect(new URL('/', origin), { status: 303 })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
