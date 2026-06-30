'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/shared/AppShell'
import { createClient } from '@/lib/supabase/client'
import '../app.css'

type ScanDepth = 'passive' | 'active' | 'deep'
type RateLimit = 'polite' | 'fast'

const WAF_IPS = '52.18.41.20\n52.18.41.21\n3.122.18.5\n3.122.18.6\n18.193.0.142'

export default function SettingsPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [profileStatus, setProfileStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwStatus, setPwStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pwError, setPwError] = useState<string | null>(null)

  const [notifs, setNotifs] = useState({
    notify_cve_matched: true,
    notify_scan_complete: false,
    notify_badge_expiry: true,
    notify_weekly_digest: false,
  })
  const [notifStatus, setNotifStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [scanDepth, setScanDepth] = useState<ScanDepth>('active')
  const [rateLimit, setRateLimit] = useState<RateLimit>('polite')
  const [defaultsStatus, setDefaultsStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [ipsCopied, setIpsCopied] = useState(false)

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? '')
    const { data } = await supabase
      .from('profiles')
      .select('name, notify_cve_matched, notify_scan_complete, notify_badge_expiry, notify_weekly_digest, default_scan_depth, default_rate_limit')
      .eq('id', user.id)
      .single()
    if (data) {
      setName(data.name ?? '')
      setNotifs({
        notify_cve_matched: data.notify_cve_matched,
        notify_scan_complete: data.notify_scan_complete,
        notify_badge_expiry: data.notify_badge_expiry,
        notify_weekly_digest: data.notify_weekly_digest,
      })
      setScanDepth(data.default_scan_depth as ScanDepth)
      setRateLimit(data.default_rate_limit as RateLimit)
    }
  }, [supabase])

  useEffect(() => { loadProfile() }, [loadProfile])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileStatus('saving')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({ name: name || null }).eq('id', user.id)
    setProfileStatus(error ? 'error' : 'saved')
    setTimeout(() => setProfileStatus('idle'), 3000)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError(null)
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }
    setPwStatus('saving')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPwError(error.message); setPwStatus('error') }
    else { setPwStatus('saved'); setNewPassword(''); setConfirmPassword('') }
    setTimeout(() => setPwStatus('idle'), 4000)
  }

  async function saveNotifs() {
    setNotifStatus('saving')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update(notifs).eq('id', user.id)
    setNotifStatus('saved')
    setTimeout(() => setNotifStatus('idle'), 3000)
  }

  async function saveDefaults() {
    setDefaultsStatus('saving')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ default_scan_depth: scanDepth, default_rate_limit: rateLimit }).eq('id', user.id)
    setDefaultsStatus('saved')
    setTimeout(() => setDefaultsStatus('idle'), 3000)
  }

  function toggleNotif(key: keyof typeof notifs) {
    setNotifs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function copyIPs() {
    navigator.clipboard.writeText(WAF_IPS)
    setIpsCopied(true)
    setTimeout(() => setIpsCopied(false), 2000)
  }

  const saveLabel = (s: 'idle' | 'saving' | 'saved' | 'error', idle = 'Save changes') =>
    s === 'saving' ? 'Saving…' : s === 'saved' ? '✓ Saved' : s === 'error' ? 'Error — try again' : idle

  return (
    <AppShell activeNav="settings">
      <main className="app-main">
        <div className="settings-inner">
          <div className="topline">
            <div>
              <h1 className="greeting">Settings</h1>
              <div className="greeting-sub">profile · notifications · scan defaults</div>
            </div>
          </div>

          {/* PROFILE */}
          <section className="settings-section">
            <h2 className="section-label">Profile</h2>
            <form onSubmit={saveProfile}>
              <div className="field-row">
                <div className="field">
                  <label>Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={email} readOnly style={{ opacity: 0.6, cursor: 'default' }} />
                  <div className="helper">Email changes require contacting support.</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="submit" className="btn btn-primary" disabled={profileStatus === 'saving'}>
                  {saveLabel(profileStatus)}
                </button>
              </div>
            </form>

            <div style={{ borderTop: '1px solid var(--line)', marginTop: 24, paddingTop: 24 }}>
              <div className="section-label" style={{ marginBottom: 14 }}>Change password</div>
              <form onSubmit={changePassword}>
                <div className="field-row">
                  <div className="field">
                    <label>New password</label>
                    <input type="password" placeholder="at least 8 chars" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Confirm</label>
                    <input type="password" placeholder="match above" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                  </div>
                </div>
                {pwError && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{pwError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button type="submit" className="btn btn-primary" disabled={pwStatus === 'saving'}>
                    {saveLabel(pwStatus, 'Update password')}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* NOTIFICATIONS */}
          <section className="settings-section">
            <h2 className="section-label">Notifications</h2>
            {([
              ['notify_cve_matched', 'New critical finding on re-scan', 'Email when a new critical or high-severity finding appears on a re-scan of your app.'],
              ['notify_scan_complete', 'Scan completed', 'Email when a scan finishes. Only useful if you run a lot of scans and want to be notified each time.'],
              ['notify_badge_expiry', 'Badge expiring in 7 days', "Heads-up email so your public badge doesn't quietly lapse."],
              ['notify_weekly_digest', 'Weekly digest', 'Friday summary of scans run and findings status.'],
            ] as const).map(([key, title, desc]) => (
              <div key={key} className="toggle-row" onClick={() => toggleNotif(key)} style={{ cursor: 'pointer' }}>
                <div className="toggle-text">
                  <h4>{title}</h4>
                  <p>{desc}</p>
                </div>
                <div className={`toggle${notifs[key] ? ' on' : ''}`} />
              </div>
            ))}
            <div className="slack-cta">
              <span style={{ color: 'var(--ink-mute)' }}>↪</span>
              All notifications are sent to your account email. GitHub integration is available in{' '}
              <Link href="/integrations">Integrations</Link>.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-primary" onClick={saveNotifs} disabled={notifStatus === 'saving'}>
                {notifStatus === 'saving' ? 'Saving…' : notifStatus === 'saved' ? '✓ Saved' : 'Save notifications'}
              </button>
            </div>
          </section>

          {/* SCAN DEFAULTS */}
          <section className="settings-section">
            <h2 className="section-label">Scan defaults</h2>

            <div className="field">
              <label>Scan depth</label>
              <div className="radio-group">
                {(['passive', 'active', 'deep'] as ScanDepth[]).map(d => (
                  <div
                    key={d}
                    className={`radio-card${scanDepth === d ? ' selected' : ''}`}
                    onClick={() => setScanDepth(d)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="radio-dot" />
                    <div className="radio-text">
                      {d === 'passive' && <><h4>Passive only</h4><p>HTTP + DNS analysis. No requests to your app&apos;s auth or write endpoints.</p></>}
                      {d === 'active' && <><h4>Active <span className="pill-mini">default</span></h4><p>50+ checks including Nuclei templates, secrets, and rate limiting. Non-destructive — we never modify your data.</p></>}
                      {d === 'deep' && <><h4>Deep</h4><p>Slower (up to 7 min), more thorough. Extends active with Nuclei template suite. May trigger WAF alerts.</p></>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Rate limit mode</label>
              <div className="radio-group">
                {(['polite', 'fast'] as RateLimit[]).map(r => (
                  <div
                    key={r}
                    className={`radio-card${rateLimit === r ? ' selected' : ''}`}
                    onClick={() => setRateLimit(r)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="radio-dot" />
                    <div className="radio-text">
                      {r === 'polite' && <><h4>Polite <span className="pill-mini">default · 10 req/s</span></h4><p>Most apps handle this fine. Adds ~15s to scan duration.</p></>}
                      {r === 'fast' && <><h4>Fast <span className="pill-mini" style={{ color: '#7A4612', background: 'var(--warn-soft)' }}>50 req/s</span></h4><p>For apps you know won&apos;t block you — staging environments, apps without WAFs.</p></>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="field">
              <label>WAF IP allowlist</label>
              <div className="int-webhook" style={{ marginTop: 0 }}>
                <span className="val">52.18.41.20  ·  52.18.41.21  ·  3.122.18.5  ·  3.122.18.6  ·  18.193.0.142</span>
                <button onClick={copyIPs}>{ipsCopied ? '✓ copied' : 'copy'}</button>
              </div>
              <div className="helper">Add these to your WAF allowlist if scans get rate-limited.</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-primary" onClick={saveDefaults} disabled={defaultsStatus === 'saving'}>
                {defaultsStatus === 'saving' ? 'Saving…' : defaultsStatus === 'saved' ? '✓ Saved' : 'Save defaults'}
              </button>
            </div>
          </section>

          {/* DANGER ZONE */}
          <section className="settings-section">
            <h2 className="section-label" style={{ color: '#84260F' }}>Danger zone</h2>
            <div className="danger-zone">
              <h3>Export or delete your data</h3>
              <p>Deletion is permanent. Reports, grades, and badge history are gone. We keep anonymised aggregate stats for trend research — nothing identifying.</p>
              <div className="danger-actions">
                <button
                  className="btn btn-soft"
                  onClick={() => alert('Data export is not yet self-serve. Email support@vibe-check-app.com and we\'ll send you a JSON export within 48 hours.')}
                >
                  ⇩ Export all data (JSON)
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (window.confirm('Delete your account? This cannot be undone.')) {
                      alert('Account deletion is not yet available. Contact support@vibe-check-app.com')
                    }
                  }}
                >
                  Delete account
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  )
}
