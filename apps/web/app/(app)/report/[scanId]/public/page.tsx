import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Public Report' }

export default function PublicReportPage({ params }: { params: { scanId: string } }) {
  return (
    <main>
      <h1>Security Report</h1>
      <p>Scan ID: {params.scanId}</p>
    </main>
  )
}
