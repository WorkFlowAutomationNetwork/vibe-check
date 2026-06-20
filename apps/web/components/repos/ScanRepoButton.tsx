'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  repoId: string
  activeScanId?: string
}

type Phase = 'idle' | 'scanning' | 'error'

export default function ScanRepoButton({ repoId, activeScanId }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>(activeScanId ? 'scanning' : 'idle')
  const [scanId, setScanId] = useState<string | null>(activeScanId ?? null)

  useEffect(() => {
    if (phase !== 'scanning' || !scanId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/repo-scans?id=${scanId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval)
          setPhase('idle')
          router.refresh()
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [phase, scanId, router])

  async function start() {
    setPhase('scanning')
    try {
      const res = await fetch('/api/repo-scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 202 || res.status === 409) {
        setScanId(data.repo_scan_id ?? null)
      } else {
        setPhase('error')
      }
    } catch {
      setPhase('error')
    }
  }

  if (phase === 'scanning') {
    return (
      <button className="btn btn-soft" disabled style={{ padding: '8px 14px', fontSize: 13 }}>
        Scanning…
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <button className="btn btn-primary" onClick={start} style={{ padding: '8px 14px', fontSize: 13 }}>
        Scan now
      </button>
      {phase === 'error' && (
        <span style={{ color: 'var(--danger)', fontSize: 12 }}>Couldn&rsquo;t start scan — try again</span>
      )}
    </span>
  )
}
