'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ScanTypePicker, { type ScanType } from '@/components/scan/ScanTypePicker'
import { useScanEligibility } from '@/lib/hooks/useScanEligibility'

export default function RescanButton({ urlId }: { urlId: string }) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [scanType, setScanType] = useState<ScanType>('passive')
  const router = useRouter()
  const { allowedScanTypes, isAdmin } = useScanEligibility()

  async function handleRescan() {
    setLoading(true)
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_id: urlId, scan_type: scanType }),
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
    <div>
      <button onClick={() => setOpen(o => !o)} className="btn-mini" disabled={loading}>
        {loading ? '...' : `↻ Re-scan ${open ? '▴' : '▾'}`}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <ScanTypePicker
            allowedScanTypes={allowedScanTypes}
            isAdmin={isAdmin}
            selected={scanType}
            onSelect={setScanType}
            compact
          />
          <button onClick={handleRescan} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }} disabled={loading}>
            {loading ? 'Starting…' : `Run ${scanType} scan →`}
          </button>
        </div>
      )}
    </div>
  )
}
