'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/settings`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="auth-card">
      <Link href="/" className="auth-logo">
        <div className="logo-mark">✓</div>
        <span>Vibe-Check</span>
      </Link>

      <h1 className="auth-title">Reset password</h1>
      <p className="auth-sub">Enter your email and we&apos;ll send a reset link.</p>

      {sent ? (
        <div className="auth-success">
          Reset link sent to <strong>{email}</strong>. Check your inbox and spam folder.
        </div>
      ) : (
        <>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={handleReset}>
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
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link →'}
            </button>
          </form>
        </>
      )}

      <p className="auth-footer">
        <Link href="/sign-in">← Back to sign in</Link>
      </p>
    </div>
  )
}
