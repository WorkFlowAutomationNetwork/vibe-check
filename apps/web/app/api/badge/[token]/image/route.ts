import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const GRADE_COLOR: Record<string, string> = {
  'A+': '#16a34a', A: '#16a34a', 'B+': '#65a30d', B: '#65a30d',
  'C+': '#d97706', C: '#d97706', D: '#ea580c', F: '#dc2626',
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: badge } = await supabase
    .from('badges')
    .select('status, expires_at, scan_id')
    .eq('public_token', params.token)
    .eq('status', 'active')
    .single()

  const valid = badge && !(badge.expires_at && new Date(badge.expires_at) < new Date())

  let grade = ''
  if (valid && badge.scan_id) {
    const { data: scan } = await supabase
      .from('scans')
      .select('grade')
      .eq('id', badge.scan_id)
      .single()
    grade = scan?.grade ?? ''
  }

  const label = 'Vibe-Checked'
  const value = valid ? (grade ? `✓ ${grade}` : '✓') : 'lapsed'
  const valueColor = valid ? (GRADE_COLOR[grade] ?? '#7c3aed') : '#6b7280'

  const labelW = 90
  const valueW = grade ? 54 : 36
  const totalW = labelW + valueW

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#0f0f0e"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${valueColor}"/>
    <rect width="${totalW}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="15" fill="#000" fill-opacity=".3">${label}</text>
    <text x="${labelW / 2}" y="14">${label}</text>
    <text x="${labelW + valueW / 2}" y="15" fill="#000" fill-opacity=".3">${value}</text>
    <text x="${labelW + valueW / 2}" y="14">${value}</text>
  </g>
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
