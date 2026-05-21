'use client'

import { useState } from 'react'

interface Props {
  scanId: string
}

export default function ReportActionsBar({ scanId }: Props) {
  const [shareCopied, setShareCopied] = useState(false)

  function shareReport() {
    const publicUrl = `${window.location.origin}/report/${scanId}/public`
    navigator.clipboard.writeText(publicUrl).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    })
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
      <button className="btn btn-soft" onClick={shareReport}>
        {shareCopied ? '✓ Link copied!' : '⇪ Share report'}
      </button>
      <button
        className="btn btn-soft"
        onClick={() => alert('PDF download will be available once the scanner service is running.')}
      >
        ⇩ Download PDF
      </button>
      <button
        className="btn btn-primary"
        onClick={() => alert('Re-scan will be available once the scanner service is running.')}
      >
        ↻ Re-scan
      </button>
    </div>
  )
}
