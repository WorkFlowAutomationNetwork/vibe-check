import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import RescanButton from '@/components/dashboard/RescanButton'
import { createServerClient } from '@/lib/supabase/server'
import type { UrlRow, ScanRow, BadgeRow, ActivityLogRow } from '@/types'
import '../app.css'

const PLAN_URL_LIMITS: Record<string, number> = { free: 1, starter: 1, monitor: 5 }

const EVENT_DISPLAY: Record<string, { glyph: string; label: string; cls: string }> = {
  scan_completed: { glyph: '↻', label: 'Scan completed', cls: 'rescan' },
  scan_started:   { glyph: '⟳', label: 'Scan started',   cls: '' },
  scan_failed:    { glyph: '✕', label: 'Scan failed',     cls: 'cve' },
  url_verified:   { glyph: '✓', label: 'URL verified',    cls: 'badge' },
  badge_issued:   { glyph: '✓', label: 'Badge issued',    cls: 'badge' },
  cve_matched:    { glyph: '!', label: 'New CVE matched', cls: 'cve' },
  url_added:      { glyph: '+', label: 'URL added',       cls: '' },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTs(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function urlInitial(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')[0].toUpperCase()
  } catch {
    return '?'
  }
}

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const [{ data: urls }, { data: profile }] = await Promise.all([
    supabase.from('urls').select('*').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('profiles').select('plan').eq('id', user.id).single(),
  ])

  const allUrls: UrlRow[] = urls ?? []
  const plan = (profile?.plan ?? 'free') as string
  const urlLimit = PLAN_URL_LIMITS[plan] ?? 1
  const urlIds = allUrls.map(u => u.id)

  let allScans: ScanRow[] = []
  let allBadges: BadgeRow[] = []
  let recentActivity: ActivityLogRow[] = []

  if (urlIds.length > 0) {
    const [{ data: scansData }, { data: badgesData }, { data: activityData }] = await Promise.all([
      supabase.from('scans').select('*').in('url_id', urlIds).order('created_at', { ascending: false }),
      supabase.from('badges').select('*').in('url_id', urlIds).eq('status', 'active'),
      supabase.from('activity_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
    ])
    allScans = scansData ?? []
    allBadges = badgesData ?? []
    recentActivity = activityData ?? []
  }

  // Latest completed scan per URL
  const latestScanByUrlId = new Map<string, ScanRow>()
  for (const scan of allScans) {
    if (!latestScanByUrlId.has(scan.url_id) && scan.status === 'completed') {
      latestScanByUrlId.set(scan.url_id, scan)
    }
  }

  // Badge per URL
  const badgeByUrlId = new Map<string, BadgeRow>()
  for (const badge of allBadges) {
    badgeByUrlId.set(badge.url_id, badge)
  }

  // Findings severity counts per scan
  const latestScanIds = Array.from(latestScanByUrlId.values()).map(s => s.id)
  const findingsByScanId = new Map<string, { critical: number; medium: number; low: number; pass: number }>()

  if (latestScanIds.length > 0) {
    const { data: findings } = await supabase
      .from('findings')
      .select('scan_id, severity')
      .in('scan_id', latestScanIds)

    for (const f of findings ?? []) {
      if (!findingsByScanId.has(f.scan_id)) {
        findingsByScanId.set(f.scan_id, { critical: 0, medium: 0, low: 0, pass: 0 })
      }
      const c = findingsByScanId.get(f.scan_id)!
      if (f.severity in c) c[f.severity as keyof typeof c]++
    }
  }

  // Quick stats
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const scansThisMonth = allScans.filter(s => s.created_at >= startOfMonth).length

  let openFindings = 0
  for (const counts of Array.from(findingsByScanId.values())) {
    openFindings += counts.critical + counts.medium + counts.low
  }

  const latestGrade = Array.from(latestScanByUrlId.values())[0]?.grade ?? '—'

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning ↗' : hour < 17 ? 'Good afternoon ↗' : 'Good evening ↗'
  const greetingSub = [
    `${allUrls.length} URL${allUrls.length !== 1 ? 's' : ''} monitored`,
    `${scansThisMonth} scan${scansThisMonth !== 1 ? 's' : ''} this month`,
  ].join(' · ')

  return (
    <AppShell activeNav="dashboard">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">{greeting}</h1>
            <div className="greeting-sub">{greetingSub}</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/onboard" className="btn btn-primary">+ Add URL</Link>
          </div>
        </div>

        <div className="quick-stats">
          <div className="qstat">
            <div className="qlab">URLs monitored</div>
            <div className="qnum">{allUrls.length}</div>
            <div className="qdelta">{allUrls.length} / {urlLimit} on {plan} plan</div>
          </div>
          <div className="qstat">
            <div className="qlab">Scans this month</div>
            <div className="qnum">{scansThisMonth}</div>
            <div className="qdelta">{scansThisMonth === 0 ? 'run your first scan' : `this month`}</div>
          </div>
          <div className="qstat">
            <div className="qlab">Open findings</div>
            <div className="qnum">{latestScanIds.length > 0 ? openFindings : '—'}</div>
            <div className="qdelta">{latestScanIds.length === 0 ? 'scan to see findings' : openFindings === 0 ? 'all clear' : 'need attention'}</div>
          </div>
          <div className="qstat">
            <div className="qlab">Latest grade</div>
            <div className="qnum">{latestGrade}</div>
            <div className="qdelta">{latestGrade === '—' ? 'no scans yet' : 'most recent scan'}</div>
          </div>
        </div>

        <h2 className="section-label">
          Your URLs <Link href="/onboard" className="see-all">+ add URL →</Link>
        </h2>

        {allUrls.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px dashed var(--line)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '64px 32px',
            textAlign: 'center',
            marginBottom: 32,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--line)' }}>+</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>No URLs yet</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', maxWidth: '32ch' }}>
              Add your first URL to run a free passive security scan.
            </div>
            <Link href="/onboard" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13 }}>+ Add your first URL</Link>
          </div>
        ) : (
          <div className="url-cards">
            {allUrls.map((url) => {
              const latestScan = latestScanByUrlId.get(url.id) ?? null
              const badge = badgeByUrlId.get(url.id) ?? null
              const counts = latestScan ? (findingsByScanId.get(latestScan.id) ?? { critical: 0, medium: 0, low: 0, pass: 0 }) : null
              const totalFindings = counts ? counts.critical + counts.medium + counts.low + counts.pass : 0
              const cleanUrl = url.url.replace(/^https?:\/\//, '')

              return (
                <div key={url.id} className="url-card">
                  <div className="uc-head">
                    <div>
                      <div className="uc-url">
                        <span className="fav">{urlInitial(url.url)}</span>
                        {cleanUrl}
                      </div>
                      <div className="uc-meta">
                        {url.monitoring_mode === 'continuous' ? 'continuous' : 'one-off scan'}
                        {' · '}added {timeAgo(url.created_at)}
                      </div>
                    </div>
                    {latestScan?.grade ? (
                      <div className="grade-block">
                        <div className="g">{latestScan.grade}</div>
                        <div className="label">grade</div>
                      </div>
                    ) : (
                      <div className="grade-block">
                        <div className="g" style={{ fontSize: 24, color: 'var(--ink-mute)' }}>—</div>
                        <div className="label">no scan</div>
                      </div>
                    )}
                  </div>

                  {latestScan ? (
                    <div className="uc-body">
                      <div className="badges-row">
                        {badge ? (
                          <span className="chip ok"><span className="dot" /> badge active</span>
                        ) : (
                          <span className="chip">no badge</span>
                        )}
                        <span className="chip">
                          {latestScan.status === 'completed'
                            ? `scanned ${timeAgo(latestScan.completed_at)}`
                            : latestScan.status}
                        </span>
                        {latestScan.checks_total && (
                          <span className="chip violet">{latestScan.checks_total}/{latestScan.checks_total} checks</span>
                        )}
                      </div>
                      {counts && totalFindings > 0 && (
                        <>
                          <div className="sev">
                            {counts.critical > 0 && <div className="seg crit" style={{ flex: counts.critical }} />}
                            {counts.medium > 0 && <div className="seg med" style={{ flex: counts.medium }} />}
                            {counts.low > 0 && <div className="seg low" style={{ flex: counts.low }} />}
                            {counts.pass > 0 && <div className="seg pass" style={{ flex: counts.pass }} />}
                          </div>
                          <div className="sev-legend">
                            {counts.critical > 0 && <span className="c"><b>{counts.critical}</b> critical</span>}
                            {counts.medium > 0 && <span className="m"><b>{counts.medium}</b> medium</span>}
                            {counts.low > 0 && <span className="l"><b>{counts.low}</b> low</span>}
                            {counts.pass > 0 && <span className="p"><b>{counts.pass}</b> passed</span>}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="uc-body">
                      <div style={{ fontSize: 13, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
                        No scan yet —{' '}
                        <Link href="/onboard" style={{ color: 'var(--violet)' }}>run your first scan →</Link>
                      </div>
                    </div>
                  )}

                  <div className="uc-foot">
                    <div className="lefty">
                      {badge ? (
                        <>badge expires <b>{formatExpiry(badge.expires_at)}</b></>
                      ) : latestScan ? (
                        'no badge · run an active scan to earn one'
                      ) : (
                        `verified: ${url.verified ? 'yes' : 'pending'}`
                      )}
                    </div>
                    <div className="righty">
                      {latestScan && (
                        <Link href={`/report/${latestScan.id}`} className="btn-mini ghost">View report</Link>
                      )}
                      {url.verified && <RescanButton urlId={url.id} />}
                    </div>
                  </div>
                </div>
              )
            })}

            {allUrls.length < urlLimit && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1.5px dashed var(--line)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '40px 24px',
                minHeight: 200,
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--line)' }}>+</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>Add another URL</div>
                <Link href="/onboard" className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>+ Add URL</Link>
              </div>
            )}

            {allUrls.length >= urlLimit && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1.5px dashed var(--line)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '40px 24px',
                minHeight: 200,
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--line)' }}>+</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>Add another URL</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', maxWidth: '28ch' }}>
                  {plan === 'monitor'
                    ? 'You\'ve reached the 5 URL limit on Monitor plan.'
                    : 'Upgrade to Monitor to track up to 5 URLs.'}
                </div>
                {plan !== 'monitor' && (
                  <Link href="/billing" className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>↑ Upgrade plan</Link>
                )}
              </div>
            )}
          </div>
        )}

        <h2 className="section-label">
          Recent activity <Link href="/activity" className="see-all">full log →</Link>
        </h2>

        {recentActivity.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 13, borderTop: '1px solid var(--line)' }}>
            No activity yet. Add a URL and run a scan to see your history here.
          </div>
        ) : (
          <div className="activity">
            {recentActivity.map((event) => {
              const { glyph, label, cls } = EVENT_DISPLAY[event.event_type] ?? { glyph: '·', label: event.event_type.replace(/_/g, ' '), cls: '' }
              const payload = event.payload ?? {}
              const detail = typeof payload['detail'] === 'string' ? payload['detail'] : null
              const urlStr = typeof payload['url'] === 'string' ? payload['url'] : null

              return (
                <div key={event.id} className={`activity-item ${cls}`}>
                  <div className="ts">{formatTs(event.created_at)}</div>
                  <div className="glyph">{glyph}</div>
                  <div className="body">
                    <b>{label}</b>
                    {urlStr && <> · <code>{urlStr.replace(/^https?:\/\//, '')}</code></>}
                    {detail && <small>{detail}</small>}
                  </div>
                  <div className="more">
                    {event.scan_id ? (
                      <Link href={`/report/${event.scan_id}`}>view →</Link>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AppShell>
  )
}
