import AdminShell from '@/components/admin/AdminShell'
import { createServiceClient } from '@/lib/supabase/server'
import '../admin.css'

interface PlanLimitRow {
  plan: string
  max_urls: number
  max_scans_per_month: number | null
  allowed_scan_types: string[]
  can_monitor: boolean
  can_badge: boolean
  can_integrations: boolean
  max_repos: number
}

const PLAN_ORDER = ['free', 'starter', 'monitor']

export default async function AdminSettingsPage() {
  const scannerUrl = process.env.SCANNER_API_URL ?? 'http://localhost:8000'
  const scannerKeySet = !!process.env.SCANNER_INTERNAL_KEY
  const redisUrl = process.env.REDIS_URL ?? '(not set)'
  const maxConcurrent = process.env.MAX_CONCURRENT_SCANS ?? '5'

  const service = createServiceClient()
  const { data: planLimitsData } = await service
    .from('plan_limits')
    .select('plan, max_urls, max_scans_per_month, allowed_scan_types, can_monitor, can_badge, can_integrations, max_repos')

  const planLimits: PlanLimitRow[] = ((planLimitsData ?? []) as PlanLimitRow[])
    .slice()
    .sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan))

  return (
    <AdminShell activeNav="settings">
      <div className="admin-body">
        <div className="admin-main">
          <div className="admin-topline">
            <div>
              <h1 className="admin-title">System Settings</h1>
              <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
                Read-only view of server environment config. Change values in your deployment environment variables.
              </p>
            </div>
          </div>

          {/* Scanner service */}
          <h2 className="section-label" style={{ marginBottom: 12 }}>Scanner service</h2>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            marginBottom: 28,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-sub)' }}>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Variable</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Value</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['SCANNER_API_URL', scannerUrl, !!scannerUrl],
                  ['SCANNER_INTERNAL_KEY', scannerKeySet ? '••••••••••••' : '(not set)', scannerKeySet],
                  ['REDIS_URL', redisUrl.replace(/:[^:@]+@/, ':••••@'), !!process.env.REDIS_URL],
                  ['MAX_CONCURRENT_SCANS', maxConcurrent, true],
                ].map(([key, val, ok], i) => (
                  <tr key={String(key)} style={{ borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{String(key)}</td>
                    <td style={{ padding: '14px 18px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-soft)' }}>{String(val)}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                        color: ok ? '#16a34a' : 'var(--danger)',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#16a34a' : 'var(--danger)', display: 'inline-block' }} />
                        {ok ? 'set' : 'missing'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Plan limits */}
          <h2 className="section-label" style={{ marginBottom: 12 }}>Plan limits</h2>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            marginBottom: 28,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-sub)' }}>
                  {['Plan', 'Max URLs', 'Max repos', 'Scans/mo', 'Scan types', 'Badge', 'Monitor', 'Integrations'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planLimits.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '14px 18px', color: 'var(--ink-mute)' }}>Failed to load plan_limits</td></tr>
                )}
                {planLimits.map((row, i, arr) => (
                  <tr key={row.plan} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <span className={`plan-tag ${row.plan}`}>{row.plan}</span>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.max_urls}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.max_repos}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.max_scans_per_month ?? '∞'}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-soft)' }}>{row.allowed_scan_types.join(', ')}</td>
                    {[row.can_badge, row.can_monitor, row.can_integrations].map((v, j) => (
                      <td key={j} style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 13, color: v ? '#16a34a' : 'var(--ink-mute)' }}>{v ? '✓' : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', background: 'var(--bg-sub)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
              Read live from <code>plan_limits</code> (enforced via Postgres RLS, migrations 20260521000014 + 20260701000030). Admin accounts bypass all limits.
            </div>
          </div>

          {/* Deployment info */}
          <h2 className="section-label" style={{ marginBottom: 12 }}>Deployment</h2>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '20px 24px',
            marginBottom: 28,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
              {[
                ['Node version', process.version],
                ['Environment', process.env.NODE_ENV ?? 'development'],
                ['Build time', new Date().toISOString().slice(0, 10)],
                ['Region', process.env.VERCEL_REGION ?? 'local'],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{String(label)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{String(value)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Scanner IPs */}
          <h2 className="section-label" style={{ marginBottom: 12 }}>Scanner IP allowlist</h2>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '20px 24px',
          }}>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: 0 }}>
              No fixed IP list is published (as of 2026-07-01). Scan traffic originates from
              our Sydney, Australia infrastructure (Fly.io, region <code>syd</code>) — the
              previous list here was placeholder AWS EU addresses that never matched real
              scanner traffic. A stable IP requires a paid static egress IP allocation
              (~$3.60/mo); not yet provisioned. If a customer asks why scans are being
              rate-limited, direct them to <code>security@vibe-check-app.com</code>.
            </p>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
