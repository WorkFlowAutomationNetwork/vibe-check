import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppShell from '@/components/shared/AppShell'
import { createServerClient } from '@/lib/supabase/server'
import type { ActivityLogRow } from '@/types'
import '../app.css'

const EVENT_DISPLAY: Record<string, { glyph: string; label: string; cls: string }> = {
  scan_completed: { glyph: '↻', label: 'Scan completed', cls: 'rescan' },
  scan_started:   { glyph: '⟳', label: 'Scan started',   cls: '' },
  scan_failed:    { glyph: '✕', label: 'Scan failed',     cls: 'cve' },
  url_verified:   { glyph: '✓', label: 'URL verified',    cls: 'badge' },
  badge_issued:   { glyph: '✓', label: 'Badge issued',    cls: 'badge' },
  badge_expired:  { glyph: '!', label: 'Badge expired',   cls: 'cve' },
  cve_matched:    { glyph: '!', label: 'New CVE matched', cls: 'cve' },
  url_added:      { glyph: '+', label: 'URL added',       cls: '' },
}

function getEvent(type: string) {
  return EVENT_DISPLAY[type] ?? { glyph: '·', label: type.replace(/_/g, ' '), cls: '' }
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '')
}

const PAGE_SIZE = 20

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: { page?: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const page = Math.max(1, Number(searchParams?.page ?? '1'))
  const from = (page - 1) * PAGE_SIZE

  const { data, count } = await supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const activity: ActivityLogRow[] = data ?? []
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <AppShell activeNav="dashboard">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Activity log</h1>
            <div className="greeting-sub">
              {count != null ? `${count} event${count !== 1 ? 's' : ''} total` : 'loading…'}
            </div>
          </div>
          <Link href="/dashboard" className="btn btn-soft">← Dashboard</Link>
        </div>

        {activity.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px dashed var(--line)',
            borderRadius: 'var(--radius)',
            padding: '64px 32px',
            textAlign: 'center',
            marginTop: 24,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--line)', marginBottom: 16 }}>·</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No activity yet</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 20 }}>
              Add a URL and run a scan to see your history here.
            </div>
            <Link href="/onboard" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13 }}>
              + Add URL →
            </Link>
          </div>
        ) : (
          <>
            <div className="activity">
              {activity.map((event) => {
                const { glyph, label, cls } = getEvent(event.event_type)
                const scanLink = event.scan_id ? `/report/${event.scan_id}` : null
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
                      {scanLink ? (
                        <Link href={scanLink}>view →</Link>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 32, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {page > 1 && (
                  <Link href={`/activity?page=${page - 1}`} className="btn btn-soft" style={{ padding: '7px 14px', fontSize: 12 }}>
                    ← prev
                  </Link>
                )}
                <span style={{ padding: '7px 14px', color: 'var(--ink-mute)' }}>
                  page {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link href={`/activity?page=${page + 1}`} className="btn btn-soft" style={{ padding: '7px 14px', fontSize: 12 }}>
                    next →
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  )
}
