'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'

type PageState = 'form' | 'confirm-pending'

// Cloudflare Turnstile JS API (loaded via the script tag below). Only the
// members we use are typed.
type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
    },
  ) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export default function SignUpPage() {
  const [pageState, setPageState] = useState<PageState>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const supabase = createClient()

  // Version identifier for the Terms/Privacy the user is accepting. Bump when
  // the documents materially change so acceptance records remain meaningful.
  const TERMS_VERSION = '[TERMS-VERSION-DATE]'

  // Turnstile is opt-in: with no site key configured (e.g. local dev before the
  // key is set), the captcha is skipped entirely and sign-up behaves as before.
  // Enable by setting NEXT_PUBLIC_TURNSTILE_SITE_KEY and the matching secret in
  // Supabase → Auth → Attack Protection.
  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const captchaEnabled = Boolean(captchaSiteKey)

  // Explicit-render the widget once its script is ready and we're on the form.
  // Explicit render (vs. implicit data-attributes) lets us capture the token
  // into state and reset it after a failed submit — Turnstile tokens are
  // single-use, so a retry needs a fresh one.
  useEffect(() => {
    if (!captchaEnabled || !scriptReady || pageState !== 'form') return
    if (!widgetRef.current || widgetIdRef.current) return
    const turnstile = window.turnstile
    if (!turnstile) return

    widgetIdRef.current = turnstile.render(widgetRef.current, {
      sitekey: captchaSiteKey!,
      callback: token => setCaptchaToken(token),
      'error-callback': () => setCaptchaToken(null),
      'expired-callback': () => setCaptchaToken(null),
    })

    return () => {
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
      setCaptchaToken(null)
    }
  }, [captchaEnabled, captchaSiteKey, scriptReady, pageState])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!accepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.')
      return
    }
    if (captchaEnabled && !captchaToken) {
      setError('Please complete the verification challenge to continue.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        // Only sent when the captcha is enabled; Supabase verifies it against
        // the Turnstile secret configured in Auth → Attack Protection.
        ...(captchaToken ? { captchaToken } : {}),
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
      // Token is spent whether accepted or not — reset so a retry gets a fresh one.
      if (captchaEnabled && widgetIdRef.current) {
        window.turnstile?.reset(widgetIdRef.current)
        setCaptchaToken(null)
      }
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
          <button
            type="button"
            onClick={() => {
              setCaptchaToken(null)
              setPageState('form')
            }}
          >
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

        {captchaEnabled && (
          <>
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="afterInteractive"
              onLoad={() => setScriptReady(true)}
            />
            <div
              ref={widgetRef}
              className="cf-turnstile"
              style={{ margin: '0 0 16px' }}
              aria-label="Verification challenge"
            />
          </>
        )}

        <button
          type="submit"
          className="auth-submit"
          disabled={loading || !accepted || (captchaEnabled && !captchaToken)}
        >
          {loading ? 'Creating account…' : 'Create account →'}
        </button>
      </form>

      <p className="auth-footer">
        Have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  )
}

