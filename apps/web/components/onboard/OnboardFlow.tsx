'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ScanTypePicker, { type ScanType } from '@/components/scan/ScanTypePicker'
import { useScanEligibility } from '@/lib/hooks/useScanEligibility'

type Step = 'url_input' | 'verify' | 'run_scan' | 'scan_pending'
type VerifyMethod = 'dns' | 'file' | 'meta'
type VerifyStatus = 'idle' | 'checking' | 'success' | 'failed'
type ScanStatus = 'idle' | 'submitting' | 'pending' | 'running' | 'completed' | 'failed'

interface State {
  step: Step
  urlId: string | null
  url: string | null
  token: string | null
  verifyMethod: VerifyMethod
  verifyStatus: VerifyStatus
  scanId: string | null
  scanStatus: ScanStatus
  scanType: ScanType
  error: string | null
}

const INITIAL_STATE: State = {
  step: 'url_input',
  urlId: null,
  url: null,
  token: null,
  verifyMethod: 'dns',
  verifyStatus: 'idle',
  scanId: null,
  scanStatus: 'idle',
  scanType: 'passive',
  error: null,
}

export default function OnboardFlow() {
  const router = useRouter()
  const [state, setState] = useState<State>(INITIAL_STATE)
  const { allowedScanTypes, isAdmin } = useScanEligibility()
  const [urlInput, setUrlInput] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function set(patch: Partial<State>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  // Step 1: submit URL
  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!urlInput.trim()) return
    if (!authorized) {
      set({ error: 'Please confirm you own or are authorised to test this URL before continuing.' })
      return
    }
    setSubmitting(true)
    set({ error: null })

    let normalized = urlInput.trim()
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`
    }

    try {
      const res = await fetch('/api/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
      })
      const data = await res.json()

      if (res.status === 409) {
        // already added — skip to verify, carry the token so copy buttons work
        set({ step: 'verify', urlId: data.url_id, url: normalized, token: data.verification_token ?? null, error: 'This URL is already in your account — just verify ownership and run a scan.' })
        setSubmitting(false)
        return
      }
      if (res.status === 402) {
        set({ error: `You've reached the URL limit for your plan (${data.limit}). Upgrade to Monitor to add more.` })
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        set({ error: data.error ?? 'Failed to add URL. Please try again.' })
        setSubmitting(false)
        return
      }

      set({ step: 'verify', urlId: data.id, url: data.url, token: data.verification_token, error: null })
    } catch {
      set({ error: 'Network error. Please try again.' })
    }
    setSubmitting(false)
  }

  // Step 2: check verification
  const handleVerify = useCallback(async () => {
    if (!state.urlId) return
    set({ verifyStatus: 'checking', error: null })

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_id: state.urlId, method: state.verifyMethod }),
      })
      const data = await res.json()

      if (data.verified) {
        set({ verifyStatus: 'success', step: 'run_scan' })
      } else {
        set({ verifyStatus: 'failed' })
      }
    } catch {
      set({ verifyStatus: 'failed', error: 'Network error while checking. Try again.' })
    }
  }, [state.urlId, state.verifyMethod])

  // Step 3: trigger scan
  async function handleRunScan() {
    if (!state.urlId) return
    set({ scanStatus: 'submitting', error: null })

    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_id: state.urlId, scan_type: state.scanType }),
      })
      const data = await res.json()

      if (res.status === 409 && data.scan_id) {
        // scan already running — jump straight to polling it
        set({ step: 'scan_pending', scanId: data.scan_id, scanStatus: 'pending' })
        return
      }
      if (!res.ok) {
        set({ scanStatus: 'failed', error: data.error ?? 'Failed to start scan.' })
        return
      }

      set({ step: 'scan_pending', scanId: data.scan_id, scanStatus: 'pending' })
    } catch {
      set({ scanStatus: 'failed', error: 'Network error. Please try again.' })
    }
  }

  // Step 4: poll scan status
  useEffect(() => {
    if (state.step !== 'scan_pending' || !state.scanId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scans?id=${state.scanId}`)
        const data = await res.json()

        if (data.status === 'completed') {
          clearInterval(interval)
          router.push(`/report/${state.scanId}`)
        } else if (data.status === 'failed') {
          clearInterval(interval)
          set({ scanStatus: 'failed', error: 'Scan failed. Please try again from the dashboard.' })
        } else {
          set({ scanStatus: data.status })
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [state.step, state.scanId, router])

  const domain = state.url ? (() => { try { return new URL(state.url).hostname } catch { return state.url ?? '' } })() : 'your-app.vercel.app'
  const token = state.token ?? '(token will appear here)'
  const verifyPath = '/.well-known/vibe-check-verify.txt'
  const metaTag = `<meta name="vibe-check" content="${token}">`

  const stepDone = (s: Step) => {
    const order: Step[] = ['url_input', 'verify', 'run_scan', 'scan_pending']
    return order.indexOf(state.step) > order.indexOf(s)
  }
  const stepActive = (s: Step) => state.step === s

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="onb-top">
        <Link href="/dashboard" className="logo">
          <div className="logo-mark">✓</div>
          <span>Vibe-Check</span>
        </Link>
        <div className="stepper">
          <div className={`stepper-step ${stepDone('url_input') ? 'done' : stepActive('url_input') ? 'active' : ''}`}>
            <div className="step-num">1</div>
            <span>Add URL</span>
          </div>
          <div className="step-line" />
          <div className={`stepper-step ${stepDone('verify') ? 'done' : stepActive('verify') ? 'active' : ''}`}>
            <div className="step-num">2</div>
            <span>Verify ownership</span>
          </div>
          <div className="step-line" />
          <div className={`stepper-step ${stepActive('run_scan') || stepActive('scan_pending') ? 'active' : ''}`}>
            <div className="step-num">3</div>
            <span style={{ color: stepActive('run_scan') || stepActive('scan_pending') ? undefined : 'var(--ink-mute)' }}>Run scan</span>
          </div>
        </div>
        <Link href="/dashboard" className="skip">save &amp; exit ✕</Link>
      </div>

      {/* Step 1: URL input */}
      {state.step === 'url_input' && (
        <div className="onb-wrap onb">
          <div className="onb-eyebrow">step 1 of 3 · enter URL</div>
          <h1>What are we checking today?</h1>
          <p className="lede">Drop the URL of the app you want to scan. The deployed one — staging counts if it&apos;s reachable from the public internet.</p>

          {state.error && (
            <div style={{ background: 'var(--danger)', color: '#fff', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
              {state.error}
            </div>
          )}

          <form className="big-input" onSubmit={handleUrlSubmit}>
            <div className="prefix">https://</div>
            <input
              type="text"
              placeholder="my-app.vercel.app"
              autoComplete="off"
              spellCheck={false}
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              disabled={submitting}
            />
            <button type="submit" disabled={submitting || !urlInput.trim() || !authorized}>
              {submitting ? 'Adding…' : 'Continue →'}
            </button>
          </form>

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
              maxWidth: 560,
            }}
          >
            <input
              type="checkbox"
              checked={authorized}
              onChange={e => setAuthorized(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
              aria-label="Confirm authorisation to scan this URL"
            />
            <span>
              I confirm I <b>own</b> this URL, or I am <b>expressly authorised by the owner</b> to
              test it. Scanning systems you are not authorised to test may be illegal — see our{' '}
              <Link href="/terms" target="_blank" style={{ color: 'var(--violet)' }}>Terms</Link>.
            </span>
          </label>

          <div className="onb-helper">We&apos;ll verify you own this before scanning. <b>Non-destructive</b> — we never modify your app or store credentials.</div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
            <span>◯ subdomains: scan separately, count as separate URLs</span>
            <span>◯ localhost / private IPs: not supported</span>
          </div>
        </div>
      )}

      {/* Step 2: Verify */}
      {state.step === 'verify' && (
        <div className="onb-wrap split onb">
          <div>
            <div className="onb-eyebrow">step 2 of 3 · verify ownership</div>
            <h1>Prove this is yours.</h1>
            <p className="lede">
              Verifying <strong>{domain}</strong>. Pick whichever method is easiest.
            </p>

            {state.error && (
              <div style={{ background: 'var(--violet-soft)', border: '1px solid var(--violet)', color: 'var(--ink)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
                {state.error}
              </div>
            )}

            {state.verifyStatus === 'failed' && (
              <div style={{ background: '#fef2f2', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
                {state.verifyMethod === 'dns'
                  ? <>Verification failed — we couldn&apos;t find the token. Double-check the TXT record is saved exactly, then wait about a minute for DNS to propagate and try again.</>
                  : <>Verification failed — we couldn&apos;t find the token. Double-check it&apos;s deployed, then wait a moment and try again.</>}
              </div>
            )}

            <div className="tabs">
              {(['dns', 'file', 'meta'] as VerifyMethod[]).map(m => (
                <div
                  key={m}
                  className={`tab${state.verifyMethod === m ? ' active' : ''}`}
                  onClick={() => set({ verifyMethod: m, verifyStatus: 'idle' })}
                >
                  {m === 'dns' ? <>DNS record <span className="badge-tab">faster</span></> : m === 'file' ? 'File upload' : 'Meta tag'}
                </div>
              ))}
            </div>

            {state.verifyMethod === 'dns' && (
              <div className="tab-pane active">
                <div className="verify-block">
                  <div className="vlabel">Add this TXT record to your DNS</div>
                  <div className="kv"><div className="k">type</div><div className="v">TXT</div></div>
                  <div className="kv"><div className="k">host</div><div className="v">_vibecheck.{domain}</div></div>
                  <div className="kv">
                    <div className="k">value</div>
                    <div className="v" style={{ display: 'block', width: '100%' }}>
                      <div className="copy-block">
                        <span className="val">{token}</span>
                        <button onClick={() => copy(token, 'dns-val')}>{copied === 'dns-val' ? '✓ copied' : 'copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className="kv"><div className="k">TTL</div><div className="v">300 (or your provider&apos;s minimum)</div></div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '10px 14px', fontSize: 13 }}
                      onClick={handleVerify}
                      disabled={state.verifyStatus === 'checking'}
                    >
                      {state.verifyStatus === 'checking' ? 'Checking…' : '↻ Check now'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {state.verifyMethod === 'file' && (
              <div className="tab-pane active">
                <div className="verify-block">
                  <div className="vlabel">Upload a file to your site</div>
                  <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink-soft)' }}>
                    Drop this file into your repo at <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-sub)', padding: '1px 5px', borderRadius: 2, fontSize: 12 }}>/public/.well-known/</code>, then deploy.
                  </p>
                  <div className="copy-block" style={{ marginBottom: 10 }}>
                    <span style={{ color: '#9a9a93' }}>path&nbsp;&nbsp;</span>
                    <span className="val">{verifyPath}</span>
                    <button onClick={() => copy(verifyPath, 'file-path')}>{copied === 'file-path' ? '✓ copied' : 'copy'}</button>
                  </div>
                  <div className="copy-block">
                    <span style={{ color: '#9a9a93' }}>body&nbsp;&nbsp;</span>
                    <span className="val">{token}</span>
                    <button onClick={() => copy(token, 'file-body')}>{copied === 'file-body' ? '✓ copied' : 'copy'}</button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '10px 14px', fontSize: 13 }}
                      onClick={handleVerify}
                      disabled={state.verifyStatus === 'checking'}
                    >
                      {state.verifyStatus === 'checking' ? 'Checking…' : '↻ Check file'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {state.verifyMethod === 'meta' && (
              <div className="tab-pane active">
                <div className="verify-block">
                  <div className="vlabel">Add a meta tag to your &lt;head&gt;</div>
                  <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink-soft)' }}>Best for static sites or anywhere editing DNS is a faff.</p>
                  <div className="copy-block">
                    <span className="val">{metaTag}</span>
                    <button onClick={() => copy(metaTag, 'meta')}>{copied === 'meta' ? '✓ copied' : 'copy'}</button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '10px 14px', fontSize: 13 }}
                      onClick={handleVerify}
                      disabled={state.verifyStatus === 'checking'}
                    >
                      {state.verifyStatus === 'checking' ? 'Checking…' : '↻ Check page source'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="next-list">
              <h3>What happens next</h3>
              <ol>
                <li>
                  <span className="nl-num">01</span>
                  <div>
                    <b>You pick a scan mode</b>
                    <small>Passive is free on every plan. Active and Deep unlock on paid plans.</small>
                  </div>
                </li>
                <li>
                  <span className="nl-num">02</span>
                  <div>
                    <b>Checks run in parallel</b>
                    <small>From ~5 outbound IPs we publish at /trust. Add them to WAF allowlists.</small>
                  </div>
                </li>
                <li>
                  <span className="nl-num">03</span>
                  <div>
                    <b>Report lands in as little as 60 seconds</b>
                    <small>Passive ~60 s · active 2–3 min · deep up to 7 min.</small>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Run scan */}
      {state.step === 'run_scan' && (
        <div className="onb-wrap onb">
          <div className="onb-eyebrow">step 3 of 3 · run scan</div>
          <h1>Ownership verified ✓</h1>
          <p className="lede">
            <strong>{domain}</strong> is confirmed. Ready to run your first security scan.
          </p>

          {state.error && (
            <div style={{ background: '#fef2f2', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
              {state.error}
            </div>
          )}

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginBottom: 10 }}>SCAN TYPE</div>
          <ScanTypePicker
            allowedScanTypes={allowedScanTypes}
            isAdmin={isAdmin}
            selected={state.scanType}
            onSelect={(scanType) => set({ scanType })}
          />

          <button
            className="btn btn-primary"
            style={{ padding: '12px 24px', fontSize: 15 }}
            onClick={handleRunScan}
            disabled={state.scanStatus === 'submitting'}
          >
            {state.scanStatus === 'submitting' ? 'Starting…' : 'Run scan →'}
          </button>
        </div>
      )}

      {/* Step 4: Scan pending */}
      {state.step === 'scan_pending' && (
        <div className="onb-wrap onb" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⟳</div>
          <h1>Scan in progress</h1>
          <p className="lede">
            Scanning <strong>{domain}</strong>.{' '}
            {state.scanType === 'passive'
              ? 'This usually takes about 60 seconds.'
              : state.scanType === 'deep'
              ? 'Deep scans take up to 7 minutes — grab a coffee.'
              : 'Active scans usually take 2–3 minutes.'}
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-mute)', marginBottom: 24 }}>
            Status: {state.scanStatus}
          </div>

          {state.error && (
            <div style={{ background: '#fef2f2', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
              {state.error}
              <div style={{ marginTop: 8 }}>
                <Link href="/dashboard" className="btn btn-soft" style={{ fontSize: 13 }}>Go to dashboard</Link>
              </div>
            </div>
          )}

          {!state.error && (
            <p style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
              You&apos;ll be redirected to your report automatically.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
