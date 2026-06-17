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

  async function handleOAuth(provider: 'google' | 'github') {
    if (!accepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
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

      <div className="auth-oauth-group">
        <button
          type="button"
          className="btn-oauth"
          onClick={() => handleOAuth('google')}
          disabled={loading}
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <button
          type="button"
          className="btn-oauth"
          onClick={() => handleOAuth('github')}
          disabled={loading}
        >
          <GitHubIcon />
          Continue with GitHub
        </button>
      </div>

      <div className="auth-divider">or</div>

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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}
