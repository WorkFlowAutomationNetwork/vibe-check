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

  // Design ref: design/Vibe-Check Badge Redesign.html -- rounded pill with an
  // offset "hard shadow" outline (matches the app's --ink shadow language),
  // a violet check-circle, and a grade letter colour-coded per GRADE_COLOR.
  const gradeColor = grade ? (GRADE_COLOR[grade] ?? '#7c3aed') : null

  const shadowFill = valid ? '#0F0F0E' : '#B9B9B0'
  const pillFill = valid ? '#FFFFFF' : '#F2F2EC'
  const pillStroke = valid ? '#0F0F0E' : '#8A8A82'
  const circleFill = valid ? '#7C3AED' : '#8A8A82'
  const labelFill = valid ? '#0F0F0E' : '#8A8A82'
  const labelDecoration = valid ? '' : ' text-decoration="line-through"'

  const gradeText = valid && grade
    ? `<text x="140" y="22" text-anchor="middle" font-family="system-ui, Arial, sans-serif" font-size="14" font-weight="800" fill="${gradeColor}">${grade}</text>`
    : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="34" viewBox="0 0 168 34">
  <rect x="7" y="7" width="158" height="27" rx="13.5" fill="${shadowFill}"/>
  <rect x="4" y="4" width="158" height="27" rx="13.5" fill="${pillFill}" stroke="${pillStroke}" stroke-width="1.5"/>
  <circle cx="19" cy="17.5" r="11" fill="${circleFill}"/>
  <text x="19" y="22" text-anchor="middle" font-family="system-ui, Arial, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF">✓</text>
  <text x="38" y="22" font-family="system-ui, Arial, sans-serif" font-size="13" font-weight="700" fill="${labelFill}"${labelDecoration}>Vibe-Checked</text>
  ${gradeText}
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
