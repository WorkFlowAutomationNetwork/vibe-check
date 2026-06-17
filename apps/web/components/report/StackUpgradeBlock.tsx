import Link from 'next/link'
import type { FindingRow } from '@/types'

// Static catalogue of deeper checks. Shown as "what an upgrade unlocks" on a
// free/passive report, and as "included in this scan" on active/deep scans.
const ACTIVE_SCANS = [
  {
    name: 'Database Exposure',
    blurb: 'Checks whether your Supabase tables are readable with the public anon key — the #1 way AI-generated apps leak customer data via missing RLS.',
  },
  {
    name: 'Secrets Exposure',
    blurb: 'Scans your JavaScript bundles for leaked API keys — OpenAI, Stripe, AWS, and Supabase service-role keys that should never reach the browser.',
  },
  {
    name: 'Authentication Review',
    blurb: 'Probes login and signup endpoints for missing rate limiting and other common auth misconfigurations.',
  },
]

/** Pull the detected tech-stack labels out of the tech-disclosure finding's
 *  metadata, and infer a couple more from other findings (e.g. Supabase). */
function detectedStack(findings: FindingRow[]): string[] {
  const stack: string[] = []

  const tech = findings.find(f => (f.metadata as { detected?: unknown })?.detected)
  const detected = (tech?.metadata as { detected?: string[] } | undefined)?.detected
  if (Array.isArray(detected)) {
    for (const d of detected) if (typeof d === 'string' && !stack.includes(d)) stack.push(d)
  }

  // If a Supabase check ran (any tier), we know they use Supabase.
  if (findings.some(f => f.title.toLowerCase().includes('supabase')) && !stack.includes('Supabase')) {
    stack.push('Supabase')
  }

  return stack
}

export default function StackUpgradeBlock({
  findings,
  scanType,
}: {
  findings: FindingRow[]
  scanType: string | null
}) {
  const stack = detectedStack(findings)
  const isFree = scanType === 'passive' || scanType == null

  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1.5px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '24px 28px',
        marginBottom: 24,
      }}
    >
      {/* Detected stack */}
      <div className="section-label" style={{ marginBottom: 12 }}>Detected stack</div>
      {stack.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {stack.map(tech => (
            <span
              key={tech}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                background: 'var(--violet-soft)',
                color: 'var(--violet-deep)',
                border: '1px solid var(--violet)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: 'var(--ink-mute)', margin: '0 0 8px' }}>
          No framework or server software was disclosed in your response headers — good, that&apos;s one less hint for attackers.
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 24px' }}>
        Many AI-generated apps share a stack — Supabase, Next.js, Vercel — and leak customer data the same handful of ways. The deeper checks below target exactly those patterns.
      </p>

      {/* Active scans available / included */}
      <div className="section-label" style={{ marginBottom: 12 }}>
        {isFree ? 'Active scans available' : 'Active scans in this report'}
      </div>
      <div style={{ display: 'grid', gap: 12, marginBottom: isFree ? 20 : 0 }}>
        {ACTIVE_SCANS.map(scan => (
          <div
            key={scan.name}
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
              borderLeft: `3px solid ${isFree ? 'var(--ink-mute)' : 'var(--lime-deep)'}`,
              paddingLeft: 14,
              opacity: isFree ? 0.85 : 1,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{isFree ? '🔒' : '✓'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{scan.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{scan.blurb}</div>
            </div>
          </div>
        ))}
      </div>

      {isFree && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingTop: 4 }}>
          <Link
            href="/billing"
            className="btn btn-primary"
            style={{ padding: '10px 18px', fontSize: 14, textDecoration: 'none' }}
          >
            Unlock active scans →
          </Link>
          <span style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
            Run all three against your verified app on a paid scan.
          </span>
        </div>
      )}
    </section>
  )
}
