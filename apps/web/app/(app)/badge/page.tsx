'use client'

import { useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/shared/AppShell'
import '../app.css'

const EMBED_URL = 'https://vibe-check.dev'
const BADGE_TOKEN = 'vc_pub_8f3a91e2demo'
const BADGE_HREF = `${EMBED_URL}/badge/${BADGE_TOKEN}`

const IMG_SNIPPET = `<a href="${BADGE_HREF}" target="_blank" rel="noopener">\n  <img src="${EMBED_URL}/badge/${BADGE_TOKEN}.svg" alt="Vibe-Checked" height="24" />\n</a>`

const MD_SNIPPET = `[![Vibe-Checked](${EMBED_URL}/badge/${BADGE_TOKEN}.svg)](${BADGE_HREF})`

export default function BadgePage() {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <AppShell activeNav="badge">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Trust Badge</h1>
            <div className="greeting-sub">public verification · embed code · badge status</div>
          </div>
        </div>

        {/* Status card */}
        <h2 className="section-label">Badge status</h2>
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
            {/* Badge preview */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: 'var(--ink)',
              color: 'var(--lime)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 3,
              letterSpacing: '0.04em',
            }}>
              <span style={{ fontSize: 14 }}>✓</span>
              Vibe-Checked
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 8 }}>B+ · May 2026</span>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>acme-app.vercel.app</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>
                <span style={{ color: '#16a34a' }}>● active</span>
                <span style={{ marginLeft: 10 }}>expires Jun 15, 2026</span>
                <span style={{ marginLeft: 10 }}>grade B+</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/report/demo" className="btn btn-soft" style={{ padding: '8px 14px', fontSize: 13 }}>View report</Link>
            <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>↻ Re-scan to renew</button>
          </div>
        </div>

        {/* Embed section */}
        <h2 className="section-label">Embed on your site</h2>
        <div style={{
          background: 'var(--bg-card)',
          border: '1.5px solid var(--line)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          marginBottom: 28,
        }}>
          {/* HTML tab */}
          <div style={{ borderBottom: '1px solid var(--line)', padding: '20px 24px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>HTML</div>
            <div style={{
              background: 'var(--bg-sub)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--ink-soft)',
              whiteSpace: 'pre',
              overflowX: 'auto',
              lineHeight: 1.7,
            }}>{IMG_SNIPPET}</div>
            <button
              onClick={() => copy(IMG_SNIPPET, 'html')}
              className="btn btn-soft"
              style={{ marginTop: 12, padding: '7px 14px', fontSize: 12 }}
            >
              {copied === 'html' ? '✓ Copied!' : 'Copy HTML'}
            </button>
          </div>

          {/* Markdown tab */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Markdown (README)</div>
            <div style={{
              background: 'var(--bg-sub)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--ink-soft)',
              overflowX: 'auto',
            }}>{MD_SNIPPET}</div>
            <button
              onClick={() => copy(MD_SNIPPET, 'md')}
              className="btn btn-soft"
              style={{ marginTop: 12, padding: '7px 14px', fontSize: 12 }}
            >
              {copied === 'md' ? '✓ Copied!' : 'Copy Markdown'}
            </button>
          </div>
        </div>

        {/* Public link */}
        <h2 className="section-label">Public report link</h2>
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
            {BADGE_HREF}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => copy(BADGE_HREF, 'link')}
              className="btn btn-soft"
              style={{ padding: '7px 14px', fontSize: 12 }}
            >
              {copied === 'link' ? '✓ Copied!' : 'Copy link'}
            </button>
            <a href={BADGE_HREF} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }}>
              Open ↗
            </a>
          </div>
        </div>

        {/* How it works */}
        <h2 className="section-label">How the badge works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            ['1. Scan', 'Run an active scan on your verified URL. The badge is issued when the scan completes.'],
            ['2. Embed', 'Paste the HTML or Markdown snippet into your site or README. The badge is cryptographically signed.'],
            ['3. Renew', 'Badges expire with your scan. Re-scan at any time to extend. Monitoring plan renews automatically on every deploy.'],
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
