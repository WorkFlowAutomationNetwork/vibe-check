'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type PageState = 'form' | 'confirm-pending'

export default function SignUpPage() {
  const [pageState, setPageState] = useState<PageState>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Version identifier for the Terms/Privacy the user is accepting. Bump when
  // the documents materially change so acceptance records remain meaningful.
  const TERMS_VERSION = '[TERMS-VERSION-DATE]'

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!accepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        // Record acceptance immediately in the auth user's metadata. Migration
        // 20260617000019 copies this into profiles.terms_accepted_at on profile
        // creation so it's queryable.
        data: {
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setPageState('confirm-pending')
    setLoading(false)
  }

  if (pageState === 'confirm-pending') {
    return (
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          <div className="logo-mark">✓</div>
          <span>Vibe-Check</span>
        </Link>

        <h1 className="auth-title">Check your email</h1>
        <p className="auth-sub">
          We sent a confirmation link to <strong>{email}</strong>.
        </p>

        <div className="auth-success">
          Click the link in your email to activate your account. No email?
          Check your spam folder or{' '}
          <button type="button" onClick={() => setPageState('form')}>
            try again
          </button>
          .
        </div>

        <p className="auth-footer">
          Already confirmed? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <Link href="/" className="auth-logo">
        <div className="logo-mark">✓</div>
        <span>Vibe-Check</span>
      </Link>

      <h1 className="auth-title">Create account</h1>
      <p className="auth-sub">Start with a free scan — no card needed.</p>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSignUp}>
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="at least 8 characters"
          />
        </div>

        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            fontSize: 13,
            color: 'var(--ink-soft)',
            lineHeight: 1.5,
            margin: '4px 0 16px',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0 }}
            aria-label="Accept Terms of Service and Privacy Policy"
          />
          <span>
            I agree to the{' '}
            <Link href="/terms" target="_blank" style={{ color: 'var(--violet)' }}>Terms of Service</Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" style={{ color: 'var(--violet)' }}>Privacy Policy</Link>,
            and I confirm I will only scan apps I own or am authorised to test.
          </span>
        </label>

        <button type="submit" className="auth-submit" disabled={loading || !accepted}>
          {loading ? 'Creating account…' : 'Create account →'}
        </button>
      </form>

      <p className="auth-footer">
        Have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  )
}

