'use client'

import { useState } from 'react'

interface VercelIntegration {
  id: string
  status: string
  last_triggered_at: string | null
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function VercelCard({
  integration: initialIntegration,
}: {
  integration: VercelIntegration | null
}) {
  const [integration, setIntegration] = useState(initialIntegration)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const connected = integration?.status === 'active'

  async function generate() {
    setLoading(true)
    const res = await fetch('/api/integrations/vercel', { method: 'POST' })
    const json = await res.json()
    setWebhookUrl(json.webhookUrl)
    setIntegration(i =>
      i
        ? { ...i, status: 'active' }
        : { id: '', status: 'active', last_triggered_at: null }
    )
    setLoading(false)
  }

  async function disconnect() {
    if (!confirm('Disconnect Vercel? Vercel will no longer trigger re-scans.')) return
    await fetch('/api/integrations/vercel', { method: 'DELETE' })
    setIntegration(null)
    setWebhookUrl(null)
  }

  async function copy() {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="int-card">
      <div className="int-head">
        <div className="int-mark vercel">▲</div>
        <div className="int-title-wrap">
          <div className="int-name">
            Vercel{' '}
            {connected && <span className="chip ok"><span className="dot" /> Connected</span>}
          </div>
          <p className="int-desc">Deploy-triggered re-scans when you ship to production. Webhook-based — no account access required.</p>
        </div>
      </div>

      {connected ? (
        <>
          <div className="int-body">
            {webhookUrl ? (
              <div className="int-detail">
                <div className="lbl">webhook url</div>
                <div className="val" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{webhookUrl}</code>
                  <button className="btn btn-soft" onClick={copy} style={{ padding: '4px 8px', fontSize: 12, flexShrink: 0 }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="int-detail">
                <div className="lbl">webhook url</div>
                <div className="val" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Regenerate to view URL again</div>
              </div>
            )}
            {integration?.last_triggered_at && (
              <div className="int-detail">
                <div className="lbl">last triggered</div>
                <div className="val">{formatRelative(integration.last_triggered_at)}</div>
              </div>
            )}
            <div className="int-note" style={{ marginTop: 8 }}>
              In Vercel: Project Settings → Git → Deploy Hooks → paste this URL.
              Every deploy triggers an active re-scan on your monitored URLs.
            </div>
          </div>
          <div className="int-actions">
            <button className="btn btn-soft" onClick={generate} disabled={loading} style={{ padding: '8px 12px', fontSize: 13 }}>
              Regenerate URL
            </button>
            <button className="btn btn-soft" onClick={disconnect} style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <div className="int-actions">
          <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ padding: '8px 12px', fontSize: 13 }}>
            {loading ? 'Connecting…' : 'Connect Vercel'}
          </button>
        </div>
      )}
    </div>
  )
}
