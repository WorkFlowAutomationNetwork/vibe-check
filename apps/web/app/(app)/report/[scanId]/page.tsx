import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Report' }

export default function ReportPage({ params }: { params: { scanId: string } }) {
  return (
    <main>
      <h1>Report</h1>
      <p>Scan ID: {params.scanId}</p>
    </main>
  )
}
