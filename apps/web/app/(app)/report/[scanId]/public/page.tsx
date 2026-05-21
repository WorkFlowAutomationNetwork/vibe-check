import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Security Report — Vibe-Check' }

const FINDINGS = [
  { severity: 'critical', title: 'Prompt injection bypass on /api/chat', category: 'AI security', passed: false },
  { severity: 'medium', title: 'Missing Content-Security-Policy header', category: 'headers', passed: false },
  { severity: 'medium', title: 'Outdated dependency: next@14.2.4 (CVE-2026-1402)', category: 'CVE', passed: false },
  { severity: 'medium', title: 'Admin route accessible without auth check', category: 'access control', passed: false },
  { severity: 'low', title: 'X-Frame-Options not set', category: 'headers', passed: false },
  { severity: 'low', title: 'Server version header exposed (nginx/1.24)', category: 'info disclosure', passed: false },
  { severity: 'pass', title: 'HTTPS enforced with valid certificate', category: 'TLS', passed: true },
  { severity: 'pass', title: 'HSTS header present and valid', category: 'headers', passed: true },
  { severity: 'pass', title: 'No open S3 buckets detected', category: 'cloud config', passed: true },
  { severity: 'pass', title: 'No API keys found in JS bundles', category: 'secrets', passed: true },
  { severity: 'pass', title: 'CORS policy is restrictive', category: 'headers', passed: true },
]

const sevColor: Record<string, string> = {
  critical: 'var(--danger)',
  medium: 'var(--warn)',
  low: 'var(--ink-mute)',
  pass: '#16a34a',
}

export default function PublicReportPage({ params }: { params: { scanId: string } }) {
  const counts = {
    critical: FINDINGS.filter(f => f.severity === 'critical').length,
    medium: FINDINGS.filter(f => f.severity === 'medium').length,
    low: FINDINGS.filter(f => f.severity === 'low').length,
    pass: FINDINGS.filter(f => f.severity === 'pass').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-display)' }}>
      {/* Header */}
      <div style={{ background: 'var(--ink)', padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 24, height: 24, background: 'var(--lime)', color: 'var(--ink)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>✓</div>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Vibe-Check</span>
          </Link>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>PUBLIC SECURITY REPORT</div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
        {/* Meta */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scanned URL</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>acme-app.vercel.app</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
            Scan completed May 16, 2026 · 180 checks · active mode · scan id {params.scanId}
          </div>
        </div>

        {/* Grade */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1.5px solid var(--line)',
          borderRadius: 'var(--radius)',
          boxShadow: '6px 6px 0 var(--ink)',
          padding: '28px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          marginBottom: 32,
          flexWrap: 'wrap',
        }}>
          <div style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 56, fontWeight: 900, lineHeight: 1, color: 'var(--ink)' }}>B+</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>overall grade</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Not on fire. But worth fixing.</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 14 }}>
              One critical issue worth addressing today. Better than ~70% of apps scanned this month.
            </div>
            <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              <span style={{ color: 'var(--danger)' }}><b>{counts.critical}</b> critical</span>
              <span style={{ color: 'var(--warn)' }}><b>{counts.medium}</b> medium</span>
              <span style={{ color: 'var(--ink-mute)' }}><b>{counts.low}</b> low</span>
              <span style={{ color: '#16a34a' }}><b>{counts.pass}</b> passed</span>
            </div>
          </div>
        </div>

        {/* Findings */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Findings ({FINDINGS.length})</div>
        <div style={{ display: 'grid', gap: 1, marginBottom: 40 }}>
          {FINDINGS.map((f) => (
            <div
              key={f.title}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--line)',
                borderLeft: `3px solid ${sevColor[f.severity]}`,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div style={{ width: 60, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: sevColor[f.severity], textTransform: 'uppercase', flexShrink: 0 }}>{f.severity}</div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: f.passed ? 400 : 500 }}>{f.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', flexShrink: 0 }}>{f.category}</div>
              <div style={{ fontSize: 16, flexShrink: 0 }}>{f.passed ? '✓' : '×'}</div>
            </div>
          ))}
        </div>

        {/* Note about full report */}
        <div style={{
          background: 'var(--violet-soft)',
          border: '1.5px solid var(--violet)',
          borderRadius: 'var(--radius)',
          padding: '20px 24px',
          marginBottom: 40,
          fontSize: 14,
          color: 'var(--ink-soft)',
          lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 700, color: 'var(--violet)' }}>This is a public summary.</span>{' '}
          Remediation steps, reproduction details, and raw scanner output are only visible to the account owner.
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '40px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vibe-Check</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Get a report for your own app.</div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 20 }}>Free passive scan. No account required.</div>
          <Link
            href="/sign-up"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--ink)',
              color: 'var(--lime)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 14,
              padding: '12px 24px',
              textDecoration: 'none',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Run free scan →
          </Link>
        </div>
      </div>
    </div>
  )
}
