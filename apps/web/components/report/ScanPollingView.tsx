'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  scanId: string
}

export default function ScanPollingView({ scanId }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<string>('pending')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scans?id=${scanId}`)
        if (!res.ok) return
        const data = await res.json()
        setStatus(data.status)

        if (data.status === 'completed') {
          clearInterval(interval)
          router.push(`/report/${scanId}`)
          router.refresh()
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setFailed(true)
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [scanId, router])

  if (failed) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✕</div>
        <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Scan failed</h2>
        <p style={{ color: 'var(--ink-soft)', marginBottom: 24 }}>
          Something went wrong with this scan. Please try running it again from the dashboard.
        </p>
        <a href="/dashboard" className="btn btn-soft" style={{ padding: '10px 20px' }}>← Back to dashboard</a>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 2s linear infinite', display: 'inline-block' }}>⟳</div>
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Scan in progress</h2>
      <p style={{ color: 'var(--ink-soft)', marginBottom: 8 }}>
        Running security checks — this usually takes 30–60 seconds.
      </p>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
        status: {status}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
