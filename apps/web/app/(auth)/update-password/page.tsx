'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// The reset email sends users through /api/auth/callback, which exchanges the
// recovery code for a real session and redirects here. So on arrival the user
// is authenticated by a *recovery* session — enough to set a new password, but
// we tear it down afterwards (signOut) and send them to /sign-in so a password
// reset actually forces a fresh login rather than silently landing them inside
// the dashboard.
type Phase = 'checking' | 'ready' | 'invalid' | 'done'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [phase, setPhase] = useState<Phase>('checking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  // Stable client instance: the readiness effect below depends on `supabase`,
  // and a fresh createClient() each render would re-run it on every state change
  // (e.g. re-running getUser after we set 'done' and reverting to the form).
  const [supabase] = useState(() => createClient())

  // No recovery session => the link was never valid, was already used, or has
  // expired. Show a dead-end message instead of a form that can't work.
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setPhase(data.user ? 'ready' : 'invalid')
    })
    return () => {
      active = false
    }
  }, [supabase])

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Invalidate the recovery session so the user must sign in with the new
    // password — this is the whole point of a "reset".
    await supabase.auth.signOut()
    setPhase('done')
    setLoading(false)
  }

  return (
    <div className="auth-card">
      <Link href="/" className="auth-logo">
        <div className="logo-mark">✓</div>
        <span>Vibe-Check</span>
      </Link>

      <h1 className="auth-title">Set a new password</h1>

      {phase === 'checking' && <p className="auth-sub">Verifying your reset link…</p>}

      {phase === 'invalid' && (
        <>
          <div className="auth-error">
            This reset link is invalid or has expired. Request a new one to continue.
          </div>
          <p className="auth-footer">
            <Link href="/reset-password">Send a new reset link</Link>
          </p>
        </>
      )}

      {phase === 'done' && (
        <>
          <div className="auth-success">
            Your password has been updated. Sign in with your new password to continue.
          </div>
          <button
            type="button"
            className="auth-submit"
            onClick={() => router.push('/sign-in?reset=success')}
          >
            Sign in →
          </button>
        </>
      )}

      {phase === 'ready' && (
        <>
          <p className="auth-sub">Choose a new password for your account.</p>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={handleUpdate}>
            <div className="auth-field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="at least 8 chars"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="match above"
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Updating…' : 'Update password →'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
