'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RescanButton({ urlId }: { urlId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRescan() {
    setLoading(true)
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_id: urlId, scan_type: 'passive' }),
      })
      const data = await res.json()
      if (res.ok || res.status === 409) {
        // 409 = scan already running — redirect to it
        router.push(`/report/${data.scan_id}`)
      } else {
        setLoading(false)
      }
    } catch {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleRescan} className="btn-mini" disabled={loading}>
      {loading ? '...' : '↻ Re-scan'}
    </button>
  )
}
