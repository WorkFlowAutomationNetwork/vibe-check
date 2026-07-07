'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTurnstile } from '@/lib/turnstile/useTurnstile'
import { TurnstileWidget } from '@/components/auth/TurnstileWidget'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const captcha = useTurnstile()

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (captcha.enabled && !captcha.token) {
      setError('Please complete the verification challenge to continue.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      // Only sent when the captcha is enabled; Supabase verifies it against the
      // Turnstile secret configured in Auth → Attack Protection.
      ...(captcha.token ? { options: { captchaToken: captcha.token } } : {}),
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      // Token is single-use — reset so a retry gets a fresh one.
      captcha.reset()
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="auth-card">
      <Link href="/" className="auth-logo">
        <div className="logo-mark">✓</div>
        <span>Vibe-Check</span>
      </Link>

      <h1 className="auth-title">Sign in</h1>
      <p className="auth-sub">Security audits for vibe-coded apps.</p>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleEmailSignIn}>
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
          <div className="field-row">
            <label htmlFor="password">Password</label>
            <Link href="/reset-password">Forgot?</Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {captcha.enabled && (
          <TurnstileWidget widgetRef={captcha.widgetRef} onScriptReady={captcha.onScriptReady} />
        )}

        <button
          type="submit"
          className="auth-submit"
          disabled={loading || (captcha.enabled && !captcha.token)}
        >
          {loading ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>

      <p className="auth-footer">
        No account? <Link href="/sign-up">Create one</Link>
      </p>
    </div>
  )
}
