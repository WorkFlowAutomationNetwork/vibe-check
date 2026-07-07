'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Only allow same-origin relative redirects (no open redirect via ?next=).
function safeNext(next: string | null): string {
  if (!next) return '/dashboard'
  if (next[0] !== '/' || next[1] === '/' || next[1] === '\\') return '/dashboard'
  return next
}

function MfaChallenge() {
  const supabase = createClient()
  const router = useRouter()
  const next = safeNext(useSearchParams().get('next'))

  const [mode, setMode] = useState<'code' | 'backup'>('code')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.mfa.listFactors()
      const totp = data?.totp?.[0]
      if (totp) setFactorId(totp.id)
    })()
  }, [supabase])

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) {
      setError('That code is not valid. Check your authenticator and try again.')
      setCode('')
      setLoading(false)
      return
    }
    router.push(next)
    router.refresh()
  }

  async function useBackupCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/auth/mfa/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: backup }),
    })
    if (!res.ok) {
      setError('That backup code is not valid or has already been used.')
      setBackup('')
      setLoading(false)
      return
    }
    // Factor was reset — send them to re-enroll.
    router.push('/mfa/enroll')
    router.refresh()
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="logo-mark">✓</div>
        <span>Vibe-Check</span>
      </div>

      {mode === 'code' ? (
        <>
          <h1 className="auth-title">Two-factor verification</h1>
          <p className="auth-sub">Enter the 6-digit code from your authenticator app.</p>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={verifyCode}>
            <div className="auth-field">
              <label htmlFor="code">6-digit code</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying…' : 'Verify →'}
            </button>
          </form>
          <p className="auth-footer">
            Lost your device?{' '}
            <button type="button" onClick={() => { setMode('backup'); setError(null) }}>Use a backup code</button>
          </p>
        </>
      ) : (
        <>
          <h1 className="auth-title">Use a backup code</h1>
          <p className="auth-sub">
            Enter one of your single-use backup codes. This resets your two-factor setup, so
            you&apos;ll set up your authenticator again afterwards.
          </p>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={useBackupCode}>
            <div className="auth-field">
              <label htmlFor="backup">Backup code</label>
              <input
                id="backup"
                autoComplete="off"
                required
                value={backup}
                onChange={e => setBackup(e.target.value.trim())}
                placeholder="xxxx-xxxx"
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading || backup.length < 8}>
              {loading ? 'Checking…' : 'Reset two-factor →'}
            </button>
          </form>
          <p className="auth-footer">
            <button type="button" onClick={() => { setMode('code'); setError(null) }}>← Back to code entry</button>
          </p>
        </>
      )}
    </div>
  )
}

export default function MfaChallengePage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<div className="auth-card"><p className="auth-sub">Loading…</p></div>}>
      <MfaChallenge />
    </Suspense>
  )
}
