'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Stage = 'loading' | 'setup' | 'codes'

export default function MfaEnrollPage() {
  const supabase = createClient()
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('loading')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const started = useRef(false)

  // Start a fresh TOTP enrollment on mount. Clean up any unverified factor left
  // over from an abandoned previous attempt so they don't accumulate.
  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error || !data) {
        setError(error?.message ?? 'Could not start enrollment. Please refresh.')
        setStage('setup')
        return
      }
      setFactorId(data.id)
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStage('setup')
    })()
  }, [supabase])

  async function verify(e: React.FormEvent) {
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

    // Session is now AAL2 — issue backup codes and mark enrollment complete.
    const res = await fetch('/api/auth/mfa/enroll-complete', { method: 'POST' })
    if (!res.ok) {
      setError('Two-factor is on, but we could not generate backup codes. Generate them from Settings.')
      setLoading(false)
      return
    }
    const { codes } = await res.json()
    setCodes(codes)
    setStage('codes')
    setLoading(false)
  }

  function copyCodes() {
    navigator.clipboard?.writeText(codes.join('\n'))
  }

  function downloadCodes() {
    const blob = new Blob([`Vibe-Check backup codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vibe-check-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  function finish() {
    router.push('/dashboard')
    router.refresh()
  }

  if (stage === 'codes') {
    return (
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark">✓</div>
          <span>Vibe-Check</span>
        </div>
        <h1 className="auth-title">Save your backup codes</h1>
        <p className="auth-sub">
          If you lose your authenticator, a backup code is the only way back into your account.
          Each works once. Store them somewhere safe — you won&apos;t see them again.
        </p>

        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 15, background: 'var(--bg-sub)',
            border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16,
            margin: '4px 0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          }}
        >
          {codes.map(c => <span key={c}>{c}</span>)}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button type="button" className="btn btn-soft" onClick={copyCodes} style={{ flex: 1 }}>Copy</button>
          <button type="button" className="btn btn-soft" onClick={downloadCodes} style={{ flex: 1 }}>Download</button>
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 16px', cursor: 'pointer' }}>
          <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} style={{ marginTop: 2 }} aria-label="I have saved my backup codes" />
          <span>I&apos;ve saved these backup codes somewhere safe.</span>
        </label>

        <button type="button" className="auth-submit" disabled={!saved} onClick={finish}>
          Continue to dashboard →
        </button>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="logo-mark">✓</div>
        <span>Vibe-Check</span>
      </div>
      <h1 className="auth-title">Set up two-factor authentication</h1>
      <p className="auth-sub">
        Vibe-Check requires 2FA to protect your account and scan data. Scan the QR code with an
        authenticator app (1Password, Google Authenticator, Authy), then enter the 6-digit code.
      </p>

      {error && <div className="auth-error">{error}</div>}

      {stage === 'loading' ? (
        <p className="auth-sub">Preparing your enrollment…</p>
      ) : (
        <>
          {qr && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 12px' }}>
              {/* qr_code is an SVG string; render as a data URI per the Supabase API. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`}
                alt="TOTP QR code"
                width={180}
                height={180}
                style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}
              />
            </div>
          )}
          {secret && (
            <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', margin: '0 0 16px' }}>
              Can&apos;t scan? Enter this key:{' '}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', wordBreak: 'break-all' }}>{secret}</span>
            </p>
          )}

          <form onSubmit={verify}>
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
              {loading ? 'Verifying…' : 'Verify & enable 2FA →'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
