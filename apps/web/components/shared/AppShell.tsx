import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

interface AppShellProps {
  children: React.ReactNode
  activeNav?: 'dashboard' | 'urls' | 'reports' | 'badge' | 'integrations' | 'billing' | 'settings'
}

export default async function AppShell({ children, activeNav }: AppShellProps) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const email = user?.email ?? ''
  const initials = email.slice(0, 2).toUpperCase()
  const displayName = email.split('@')[0]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="logo">
          <div className="logo-mark">✓</div>
          <span>Vibe-Check</span>
        </Link>
        <nav>
          <Link href="/dashboard" className={activeNav === 'dashboard' ? 'active' : ''}>
            <span className="nav-ico">◉</span> Overview
          </Link>
          <Link href="/dashboard" className={activeNav === 'urls' ? 'active' : ''}>
            <span className="nav-ico">≡</span> My URLs
          </Link>
          <Link href="/dashboard" className={activeNav === 'reports' ? 'active' : ''}>
            <span className="nav-ico">▤</span> Reports
          </Link>
          <Link href="/badge" className={activeNav === 'badge' ? 'active' : ''}>
            <span className="nav-ico">✓</span> Badge
          </Link>
          <Link href="/integrations" className={activeNav === 'integrations' ? 'active' : ''}>
            <span className="nav-ico">⇄</span> Integrations
          </Link>
          <Link href="/billing" className={activeNav === 'billing' ? 'active' : ''}>
            <span className="nav-ico">$</span> Billing
          </Link>
          <Link href="/settings" className={activeNav === 'settings' ? 'active' : ''}>
            <span className="nav-ico">⚙</span> Settings
          </Link>
          <div className="nav-sep">Help</div>
          <Link href="/docs">
            <span className="nav-ico">?</span> Docs &amp; methodology
          </Link>
          <a href="mailto:support@vibe-check.dev">
            <span className="nav-ico">@</span> Email support
          </a>
        </nav>
        <div className="plan-chip">
          <div className="avatar">{initials}</div>
          <div className="who">
            <b>{displayName}</b>
            <small>Free plan</small>
          </div>
        </div>
      </aside>
      {children}
    </div>
  )
}
