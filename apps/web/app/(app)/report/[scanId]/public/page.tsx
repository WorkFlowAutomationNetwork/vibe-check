import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Security Report — Vibe-Check' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function PublicReportPage({ params }: { params: { scanId: string } }) {
  const supabase = createServerClient()

  // public_scans is already scoped to urls with public_report_enabled = true
  // (supabase/migrations/20260701000031) -- no further filter needed here,
  // and the anon key has no path to a scan whose owner hasn't opted in.
  const { data: scan } = await supabase
    .from('public_scans')
    .select('id, grade, score, completed_at, scan_type, url_id, checks_total')
    .eq('id', params.scanId)
    .single()

  if (!scan) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>Report not public</h1>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 24 }}>
            The owner of this report has not made it public. Sign up to run a free security scan on your own app.
          </p>
          <Link href="/sign-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ink)', color: 'var(--lime)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, padding: '12px 24px', textDecoration: 'none', borderRadius: 'var(--radius-sm)' }}>
            Run free scan →
          </Link>
        </div>
      </div>
    )
  }

  const [{ data: urlRow }, { data: findingCounts }] = await Promise.all([
    supabase.from('public_urls').select('url').eq('id', scan.url_id).single(),
    // Severity + count only -- no title/category/result. See migration
    // 20260701000031 for why: application-layer hiding isn't a
    // confidentiality boundary against the anon key, so the view itself
    // never exposes per-finding detail to begin with.
    supabase.from('public_finding_counts')
      .select('severity, count')
      .eq('scan_id', params.scanId),
  ])

  const displayUrl = (urlRow?.url ?? '').replace(/^https?:\/\//, '')

  const bySeverity = new Map((findingCounts ?? []).map(f => [f.severity, f.count]))
  const counts = {
    critical: bySeverity.get('critical') ?? 0,
    medium:   bySeverity.get('medium') ?? 0,
    low:      bySeverity.get('low') ?? 0,
    pass:     bySeverity.get('pass') ?? 0,
  }
  const totalFindings = Array.from(bySeverity.values()).reduce((sum, n) => sum + n, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-display)' }}>
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
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scanned URL</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>{displayUrl}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
            Scan completed {formatDate(scan.completed_at)}
            {scan.checks_total ? ` · ${scan.checks_total} checks` : ''}
            {scan.scan_type ? ` · ${scan.scan_type} mode` : ''}
            {' · '}scan id {params.scanId.slice(0, 8)}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: '6px 6px 0 var(--ink)', padding: '28px 32px', display: 'flex', alignItems: 'center', gap: 28, marginBottom: 32, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 56, fontWeight: 900, lineHeight: 1, color: 'var(--ink)' }}>{scan.grade ?? '—'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>overall grade</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Security report</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 14 }}>
              {totalFindings} checks performed.
            </div>
            <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {counts.critical > 0 && <span style={{ color: 'var(--danger)' }}><b>{counts.critical}</b> critical</span>}
              {counts.medium > 0 && <span style={{ color: 'var(--warn)' }}><b>{counts.medium}</b> medium</span>}
              {counts.low > 0 && <span style={{ color: 'var(--ink-mute)' }}><b>{counts.low}</b> low</span>}
              {counts.pass > 0 && <span style={{ color: '#16a34a' }}><b>{counts.pass}</b> passed</span>}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--violet-soft)', border: '1.5px solid var(--violet)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 40, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: 'var(--violet)' }}>This is a high-level summary.</span>{' '}
          Only the grade and check totals by severity are shared here — specific finding titles, categories,
          reproduction details, and remediation steps are only visible to the account owner.
        </div>

        <div style={{ textAlign: 'center', padding: '40px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vibe-Check</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Get a report for your own app.</div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 20 }}>Free passive scan. No card needed.</div>
          <Link href="/sign-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ink)', color: 'var(--lime)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, padding: '12px 24px', textDecoration: 'none', borderRadius: 'var(--radius-sm)' }}>
            Run free scan →
          </Link>
        </div>
      </div>
    </div>
  )
}
