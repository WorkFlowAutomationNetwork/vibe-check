'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RemoveUrlButton({ urlId, urlLabel }: { urlId: string; urlLabel: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleRemove() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/urls/${urlId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(
        data?.error === 'url_has_scans'
          ? "Can't remove — this URL has a scan"
          : "Couldn't remove — try again",
      )
      setLoading(false)
    } catch {
      setError("Couldn't remove — try again")
      setLoading(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn-mini ghost"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${urlLabel}`}
      >
        ✕ Remove
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
        {error ?? 'Remove?'}
      </span>
      <button type="button" className="btn-mini" onClick={handleRemove} disabled={loading}>
        {loading ? '…' : '✓ yes'}
      </button>
      <button
        type="button"
        className="btn-mini ghost"
        onClick={() => { setConfirming(false); setError(null) }}
        disabled={loading}
      >
        ✗ no
      </button>
    </span>
  )
}
