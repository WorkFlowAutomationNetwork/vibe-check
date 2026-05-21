import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import './app.css'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  return <>{children}</>
}
