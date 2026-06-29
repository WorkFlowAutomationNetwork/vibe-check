'use client'

import { useEffect, useRef, useState } from 'react'

interface FlyMachine {
  id: string
  state: string
  cpuKind: string
  cpus: number
  memoryMb: number
  estMonthly: number
}

interface FlyApp {
  name: string
  machines: FlyMachine[]
  estMonthly: number
  error?: string
}

interface StaticService {
  label: string
  currentMonthly: number
  scaleMonthly: number
  currentNote: string
  scaleNote: string
  scaleThreshold: string
}

interface FlyBilling {
  orgName: string
  orgSlug: string
  currentPeriodAmountCents: number | null
  creditBalanceCents: number | null
  billingStatus: string | null
}

interface CostData {
  live: boolean
  reason?: string
  flyApps: FlyApp[]
  flyTotal: number
  billing: FlyBilling | null
  staticServices: StaticService[]
  total: number
  scaleTotal: number
  fetchedAt: string
}

const REFRESH_INTERVAL = 60_000

export default function InfraCostPanel() {
  const [data, setData] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showScale, setShowScale] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/admin/infra-cost')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: CostData = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, REFRESH_INTERVAL)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const updatedAt = data ? new Date(data.fetchedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null

  return (
    <div className="admin-table-wrap" style={{ marginBottom: 0 }}>
      <div className="admin-table-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="admin-table-title">
          Infrastructure Costs
          {data?.live && (
            <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--lime)', color: 'var(--ink)', padding: '2px 6px', borderRadius: 2, fontWeight: 600, letterSpacing: '0.04em' }}>
              LIVE
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {updatedAt && (
            <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
              Updated {updatedAt}
            </span>
          )}
          <button
            onClick={load}
            style={{ fontSize: 11, color: 'var(--ink-mute)', background: 'none', border: '1px solid var(--line)', borderRadius: 2, padding: '3px 8px', cursor: 'pointer' }}
          >
            Refresh
          </button>
          <button
            onClick={() => setShowScale(v => !v)}
            style={{
              fontSize: 11,
              color: showScale ? 'var(--violet)' : 'var(--ink-mute)',
              background: showScale ? 'var(--violet-soft)' : 'none',
              border: `1px solid ${showScale ? 'var(--violet)' : 'var(--line)'}`,
              borderRadius: 2,
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            {showScale ? 'Showing at-scale' : 'Show at-scale'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
          Loading live cost data…
        </div>
      )}

      {error && (
        <div style={{ padding: '16px 24px', color: 'var(--danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {data?.billing && !loading && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Fly.io projected (full mo.)
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {fmt(data.flyTotal)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>based on running machines</div>
          </div>

          {data.billing.creditBalanceCents !== null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Credit balance
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: data.billing.creditBalanceCents > 0 ? 'var(--lime-deep)' : 'var(--ink)' }}>
                ${(data.billing.creditBalanceCents / 100).toFixed(2)}
              </div>
            </div>
          )}

          {data.billing.billingStatus && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Billing status
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 2, display: 'inline-block',
                background: data.billing.billingStatus === 'CURRENT' ? 'var(--lime)' : 'var(--warn)',
                color: 'var(--ink)',
              }}>
                {data.billing.billingStatus}
              </div>
            </div>
          )}

          <div style={{ marginLeft: 'auto' }}>
            <a
              href={`https://fly.io/organizations/${data.billing.orgSlug}/billing`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--violet)', textDecoration: 'none', fontWeight: 500 }}
            >
              View actual bill on Fly.io ↗
            </a>
            <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>
              MTD spend not in public API
            </div>
          </div>
        </div>
      )}

      {!data?.live && data?.reason && !loading && (
        <div style={{ padding: '12px 20px', background: 'var(--bg-sub)', fontSize: 12, color: 'var(--ink-mute)', borderBottom: '1px solid var(--line)' }}>
          {data.reason}
        </div>
      )}

      {data && !loading && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Service</th>
              <th style={{ color: 'var(--ink-mute)', fontSize: 11 }}>
                {showScale ? 'At-scale note' : 'Current note'}
              </th>
              <th style={{ textAlign: 'right' }}>
                {showScale ? 'At-scale $/mo' : 'Current $/mo'}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Fly.io apps from live API */}
            {data.flyApps.map(app => (
              <tr key={app.name}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {app.name}
                  {app.error && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--danger)' }}>({app.error})</span>
                  )}
                </td>
                <td style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
                  {app.machines.length === 0 ? 'No machines' : app.machines.map(m => (
                    <span key={m.id} style={{ display: 'inline-block', marginRight: 8 }}>
                      {m.state === 'started' ? '●' : '○'} {m.cpus}×{m.cpuKind} {m.memoryMb}MB
                    </span>
                  ))}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {app.estMonthly === 0 && app.machines.length === 0
                    ? <span style={{ color: 'var(--ink-mute)' }}>—</span>
                    : fmt(app.estMonthly)
                  }
                </td>
              </tr>
            ))}

            {/* Static services */}
            {data.staticServices.map(s => (
              <tr key={s.label}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.label}</td>
                <td style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
                  {showScale ? (
                    <>
                      {s.scaleNote}
                      <span style={{ display: 'block', color: 'var(--warn)', marginTop: 2 }}>
                        Trigger: {s.scaleThreshold}
                      </span>
                    </>
                  ) : s.currentNote}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {showScale
                    ? (s.scaleMonthly === 0
                      ? <span style={{ color: 'var(--lime-deep)' }}>Free</span>
                      : <span style={{ color: 'var(--warn)' }}>{fmt(s.scaleMonthly)}</span>)
                    : (s.currentMonthly === 0
                      ? <span style={{ color: 'var(--lime-deep)' }}>Free</span>
                      : fmt(s.currentMonthly))
                  }
                </td>
              </tr>
            ))}

            <tr style={{ borderTop: '2px solid var(--ink)' }}>
              <td colSpan={2} style={{ fontWeight: 700 }}>
                {showScale ? 'Total at-scale monthly infra' : 'Total est. monthly infra'}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {showScale ? fmt(data.scaleTotal) : fmt(data.total)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {data && !loading && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', background: 'var(--bg-sub)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
            Fly.io prices: shared vCPU $0.0000016/s · RAM $0.0000025/GB/s. Only running machines counted.
          </div>
          {!data.live && (
            <div style={{ fontSize: 11, color: 'var(--warn)' }}>
              Add <code>FLY_API_TOKEN</code> to Vercel env vars for live machine data.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
