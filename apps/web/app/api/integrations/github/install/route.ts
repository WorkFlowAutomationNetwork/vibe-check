import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { signState, buildInstallUrl } from '@/lib/github/app'

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const state = signState({ userId: user.id })
  return NextResponse.redirect(buildInstallUrl(state), { status: 302 })
}
