'use client'

import { useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/shared/AppShell'

interface BadgeData {
  id: string
  scan_id: string
  url_id: string
  status: string
  public_token: string
  expires_at: string
  grade: string | null
  completed_at: string | null
  url: string | null
  public_report_enabled: boolean
}

interface Props {
  badge: BadgeData | null
  appUrl: string
  isPaid?: boolean
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BadgeClient({ badge, appUrl, isPaid = true }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [publicReportEnabled, setPublicReportEnabled] = useState(badge?.public_report_enabled ?? false)
  const [togglePending, setTogglePending] = useState(false)

  const publicReportHref = badge
    ? (publicReportEnabled ? `${appUrl}/report/${badge.scan_id}/public` : appUrl)
    : ''
  const badgeImgSrc = badge ? `${appUrl}/api/badge/${badge.public_token}/image` : ''
  const imgSnippet = badge
    ? `<a href="${publicReportHref}" target="_blank" rel="noopener">\n  <img src="${badgeImgSrc}" alt="Vibe-Checked" height="34" />\n</a>`
    : ''
  const mdSnippet = badge
    ? `[![Vibe-Checked](${badgeImgSrc})](${publicReportHref})`
    : ''

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  async function toggleReportVisibility() {
    if (!badge || togglePending) return
    const next = !publicReportEnabled
    setTogglePending(true)
    setPublicReportEnabled(next) // optimistic
    try {
      const res = await fetch(`/api/urls/${badge.url_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_report_enabled: next }),
      })
      if (!res.ok) setPublicReportEnabled(!next) // revert on failure
    } catch {
      setPublicReportEnabled(!next)
    } finally {
      setTogglePending(false)
    }
  }

  const displayUrl = badge?.url?.replace(/^https?:\/\//, '') ?? ''
  const scanReportLink = badge ? `/report/${badge.scan_id}` : '/dashboard'

  return (
    <AppShell activeNav="badge">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Trust Badge</h1>
            <div className="greeting-sub">public verification · embed code · badge status</div>
          </div>
        </div>

        <h2 className="section-label">Badge status</h2>

        {!badge ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px dashed var(--line)',
            borderRadius: 'var(--radius)',
            padding: '48px 32px',
            textAlign: 'center',
            marginBottom: 28,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--line)', marginBottom: 16 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No badge yet</div>
            {isPaid ? (
              <>
                <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 20, maxWidth: '42ch', margin: '0 auto 20px' }}>
                  Your Vibe-Checked badge is issued when a full (active) scan completes on a verified URL.
                </div>
                <Link href="/onboard" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13 }}>
                  + Add URL and scan →
                </Link>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 20, maxWidth: '46ch', margin: '0 auto 20px' }}>
                  The Vibe-Checked badge is earned on a full scan, which isn&rsquo;t part of the free plan.
                  Purchase a one-time scan or upgrade to Monitor to run one and earn your badge.
                </div>
                <Link href="/billing" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13 }}>
                  See plans →
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{
              background: 'var(--bg-card)',
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius)',
              boxShadow: '6px 6px 0 var(--ink)',
              padding: '24px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 24,
              marginBottom: 28,
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <img src={badgeImgSrc} alt="Vibe-Checked badge" width={168} height={34} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{displayUrl}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>
                    <span style={{ color: '#16a34a' }}>● active</span>
                    <span style={{ marginLeft: 10 }}>expires {formatExpiry(badge.expires_at)}</span>
                    {badge.grade && <span style={{ marginLeft: 10 }}>grade {badge.grade}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link href={scanReportLink} className="btn btn-soft" style={{ padding: '8px 14px', fontSize: 13 }}>View report</Link>
                <Link href={`/onboard?url_id=${badge.url_id}`} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>↻ Re-scan to renew</Link>
              </div>
            </div>

            <h2 className="section-label">Public report visibility</h2>
            <div style={{
              background: 'var(--bg-card)',
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap',
              marginBottom: 28,
            }}>
              <div style={{ maxWidth: '52ch' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  Let visitors click through to a summary report
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                  Off by default — the badge shows your grade but clicking it just goes to vibe-check-app.com.
                  Turn this on to link through to a public summary instead (grade + how many checks passed by
                  severity — never specific finding titles, categories, or remediation detail).
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={publicReportEnabled}
                onClick={toggleReportVisibility}
                disabled={togglePending}
                className="btn btn-soft"
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  flexShrink: 0,
                  ...(publicReportEnabled ? { background: 'var(--violet)', color: 'white', borderColor: 'var(--violet)' } : {}),
                }}
              >
                {publicReportEnabled ? '✓ Public' : 'Private'}
              </button>
            </div>

            <h2 className="section-label">Embed on your site</h2>
            <div style={{
              background: 'var(--bg-card)',
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              marginBottom: 28,
            }}>
              <div style={{ borderBottom: '1px solid var(--line)', padding: '20px 24px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>HTML</div>
                <div style={{ background: 'var(--bg-sub)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'pre', overflowX: 'auto', lineHeight: 1.7 }}>{imgSnippet}</div>
                <button onClick={() => copy(imgSnippet, 'html')} className="btn btn-soft" style={{ marginTop: 12, padding: '7px 14px', fontSize: 12 }}>
                  {copied === 'html' ? '✓ Copied!' : 'Copy HTML'}
                </button>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Markdown (README)</div>
                <div style={{ background: 'var(--bg-sub)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-soft)', overflowX: 'auto' }}>{mdSnippet}</div>
                <button onClick={() => copy(mdSnippet, 'md')} className="btn btn-soft" style={{ marginTop: 12, padding: '7px 14px', fontSize: 12 }}>
                  {copied === 'md' ? '✓ Copied!' : 'Copy Markdown'}
                </button>
              </div>
            </div>

            <h2 className="section-label">Public report link</h2>
            {publicReportEnabled ? (
              <div style={{
                background: 'var(--bg-card)',
                border: '1.5px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
                marginBottom: 28,
              }}>
                <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-soft)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {publicReportHref}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => copy(publicReportHref, 'link')} className="btn btn-soft" style={{ padding: '7px 14px', fontSize: 12 }}>
                    {copied === 'link' ? '✓ Copied!' : 'Copy link'}
                  </button>
                  <a href={publicReportHref} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }}>Open ↗</a>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'var(--bg-sub)',
                border: '1.5px dashed var(--line)',
                borderRadius: 'var(--radius)',
                padding: '16px 24px',
                fontSize: 13,
                color: 'var(--ink-mute)',
                marginBottom: 28,
              }}>
                Turn on public report visibility above to get a shareable link.
              </div>
            )}
          </>
        )}

        <h2 className="section-label">How the badge works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            ['1. Scan', 'Run an active scan on your verified URL. The badge is issued when the scan completes.'],
            ['2. Embed', 'Paste the HTML or Markdown snippet into your site or README. The badge is cryptographically signed.'],
            ['3. Renew', 'Badges expire with your scan. Re-scan at any time to extend. Monitor plan subscribers can also trigger re-scans via deploy hooks.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ background: 'var(--bg-card)', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)', padding: '20px 20px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--violet)', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  )
}
