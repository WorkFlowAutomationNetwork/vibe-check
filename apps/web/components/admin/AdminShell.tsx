import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type AdminNavItem = 'overview' | 'users' | 'subscriptions' | 'scans' | 'analytics' | 'revenue' | 'settings'

interface AdminShellProps {
  children: React.ReactNode
  activeNav?: AdminNavItem
}

export default async function AdminShell({ children, activeNav }: AdminShellProps) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const email = user?.email ?? ''
  const initials = email.slice(0, 2).toUpperCase()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Link href="/admin" className="admin-logo">
            <div className="admin-logo-mark">✓</div>
            <div>
              <span className="admin-logo-name">Vibe-Check</span>
              <span className="admin-badge">ADMIN</span>
            </div>
          </Link>
        </div>

        <nav className="admin-nav">
          <div className="admin-nav-section">Platform</div>
          <Link href="/admin" className={`admin-nav-link${activeNav === 'overview' ? ' active' : ''}`}>
            <span className="nav-ico">◉</span> Overview
          </Link>
          <Link href="/admin/users" className={`admin-nav-link${activeNav === 'users' ? ' active' : ''}`}>
            <span className="nav-ico">◎</span> Users
          </Link>
          <Link href="/admin/subscriptions" className={`admin-nav-link${activeNav === 'subscriptions' ? ' active' : ''}`}>
            <span className="nav-ico">$</span> Subscriptions
          </Link>
          <Link href="/admin/scans" className={`admin-nav-link${activeNav === 'scans' ? ' active' : ''}`}>
            <span className="nav-ico">▤</span> Scans
          </Link>
          <Link href="/admin/analytics" className={`admin-nav-link${activeNav === 'analytics' ? ' active' : ''}`}>
            <span className="nav-ico">◈</span> Analytics
          </Link>
          <Link href="/admin/revenue" className={`admin-nav-link${activeNav === 'revenue' ? ' active' : ''}`}>
            <span className="nav-ico">◆</span> Revenue
          </Link>

          <div className="admin-nav-section" style={{ marginTop: 20 }}>System</div>
          <Link href="/admin/settings" className={`admin-nav-link${activeNav === 'settings' ? ' active' : ''}`}>
            <span className="nav-ico">⚙</span> Settings
          </Link>
          <Link href="/dashboard" className="admin-nav-link">
            <span className="nav-ico">←</span> Back to App
          </Link>
        </nav>

        <div className="admin-user-chip">
          <div className="admin-avatar">{initials}</div>
          <div className="admin-who">
            <b>{email.split('@')[0]}</b>
            <small>Administrator</small>
          </div>
        </div>
      </aside>

      <div className="admin-body">{children}</div>
    </div>
  )
}
