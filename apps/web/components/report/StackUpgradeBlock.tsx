import Link from 'next/link'
import type { FindingRow } from '@/types'

// Static catalogue of deeper checks, each mapped to the check_name(s) the
// underlying scanner(s) actually use — lets the badge below tell "ran and
// found a real result" apart from "ran, but nothing here to test" instead
// of always showing a green checkmark regardless of outcome.
const ACTIVE_SCANS = [
  {
    name: 'Database Exposure',
    blurb: 'Checks whether your Supabase tables are readable with the public anon key — the #1 way AI-generated apps leak customer data via missing RLS.',
    checkNames: ['supabase-rls-exposure', 'supabase-storage-exposure'],
  },
  {
    name: 'Secrets Exposure',
    blurb: 'Scans your JavaScript bundles for leaked API keys — OpenAI, Stripe, AWS, and Supabase service-role keys that should never reach the browser.',
    checkNames: ['exposed-secret', 'public-keys'],
  },
  {
    name: 'Authentication Review',
    blurb: 'Probes login and signup endpoints for missing rate limiting and other common auth misconfigurations.',
    checkNames: ['rate-limit-probe'],
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

type BadgeState = 'locked' | 'neutral' | 'ran'

function badgeStateFor(checkNames: string[], findings: FindingRow[]): { state: BadgeState; note: string | null } {
  const matches = findings.filter(f => checkNames.includes(f.check_name))
  if (matches.length === 0) return { state: 'locked', note: null }
  if (matches.every(f => f.severity === 'info')) {
    return { state: 'neutral', note: matches[0].description }
  }
  return { state: 'ran', note: null }
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
        {ACTIVE_SCANS.map(scan => {
          const { state, note } = isFree
            ? { state: 'locked' as BadgeState, note: null }
            : badgeStateFor(scan.checkNames, findings)

          const icon = state === 'ran' ? '✓' : state === 'neutral' ? '·' : '🔒'
          const borderColor = state === 'ran'
            ? 'var(--lime-deep)'
            : state === 'neutral'
              ? 'var(--ink-mute)'
              : 'var(--ink-mute)'

          return (
            <div
              key={scan.name}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                borderLeft: `3px solid ${borderColor}`,
                paddingLeft: 14,
                opacity: state === 'locked' ? 0.85 : 1,
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{scan.name}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{scan.blurb}</div>
                {note && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-mute)', lineHeight: 1.5, marginTop: 4 }}>
                    {note}
                  </div>
                )}
              </div>
            </div>
          )
        })}
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
