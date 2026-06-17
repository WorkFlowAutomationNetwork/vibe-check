'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ScanTypePicker, { type ScanType } from '@/components/scan/ScanTypePicker'
import { useScanEligibility } from '@/lib/hooks/useScanEligibility'
import { createClient } from '@/lib/supabase/client'

interface Props {
  scanId: string
  urlId: string
  pdfStoragePath?: string | null
}

export default function ReportActionsBar({ scanId, urlId, pdfStoragePath }: Props) {
  const [shareCopied, setShareCopied] = useState(false)
  const [rescanOpen, setRescanOpen] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [scanType, setScanType] = useState<ScanType>('passive')
  const router = useRouter()
  const { allowedScanTypes, isAdmin } = useScanEligibility()

  async function downloadPdf() {
    if (!pdfStoragePath) {
      alert('No PDF is available for this scan yet.')
      return
    }
    setDownloadingPdf(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from('reports')
        .createSignedUrl(pdfStoragePath, 60)
      if (error || !data?.signedUrl) {
        alert('Could not generate a download link. Please try again.')
        return
      }
      window.open(data.signedUrl, '_blank')
    } finally {
      setDownloadingPdf(false)
    }
  }

  function shareReport() {
    const publicUrl = `${window.location.origin}/report/${scanId}/public`
    navigator.clipboard.writeText(publicUrl).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    })
  }

  async function handleRescan() {
    setRescanning(true)
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_id: urlId, scan_type: scanType }),
      })
      const data = await res.json()
      if (res.ok || res.status === 409) {
        router.push(`/report/${data.scan_id}`)
      } else {
        setRescanning(false)
      }
    } catch {
      setRescanning(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        <button className="btn btn-soft" onClick={shareReport}>
          {shareCopied ? '✓ Link copied!' : '⇪ Share report'}
        </button>
        <button
          className="btn btn-soft"
          onClick={downloadPdf}
          disabled={downloadingPdf || !pdfStoragePath}
          title={pdfStoragePath ? undefined : 'No PDF available for this scan yet'}
        >
          {downloadingPdf ? 'Preparing…' : '⇩ Download PDF'}
        </button>
        <button className="btn btn-primary" onClick={() => setRescanOpen(o => !o)}>
          ↻ Re-scan {rescanOpen ? '▴' : '▾'}
        </button>
      </div>

      {rescanOpen && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 10, width: 360,
          background: 'var(--bg-card)', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
          boxShadow: '6px 6px 0 var(--ink)', padding: 16,
        }}>
          <ScanTypePicker
            allowedScanTypes={allowedScanTypes}
            isAdmin={isAdmin}
            selected={scanType}
            onSelect={setScanType}
            compact
          />
          <button
            onClick={handleRescan}
            className="btn btn-primary"
            style={{ width: '100%', padding: '8px 14px', fontSize: 13 }}
            disabled={rescanning}
          >
            {rescanning ? 'Starting…' : `Run ${scanType} scan →`}
          </button>
        </div>
      )}
    </div>
  )
}
