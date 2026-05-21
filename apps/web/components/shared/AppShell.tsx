'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface AppShellProps {
  children: React.ReactNode
  activeNav?: 'dashboard' | 'urls' | 'reports' | 'badge' | 'integrations' | 'billing' | 'settings'
}

export default function AppShell({ children, activeNav }: AppShellProps) {
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [planLabel, setPlanLabel] = useState('Free plan')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      supabase
        .from('profiles')
        .select('is_admin, plan')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (!data) return
          setIsAdmin(data.is_admin ?? false)
          if (data.plan === 'starter') setPlanLabel('Starter')
          else if (data.plan === 'monitor') setPlanLabel('Monitor')
        })
    })
  }, [])

  const initials = email ? email.slice(0, 2).toUpperCase() : ''
  const displayName = email ? email.split('@')[0] : ''

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
          {isAdmin && (
            <>
              <div className="nav-sep">Admin</div>
              <Link href="/admin" style={{ color: 'var(--violet)', fontWeight: 600 }}>
                <span className="nav-ico" style={{ color: 'var(--violet)' }}>★</span> Admin panel
              </Link>
            </>
          )}
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
            <small>{planLabel}</small>
          </div>
        </div>
      </aside>
      {children}
    </div>
  )
}
