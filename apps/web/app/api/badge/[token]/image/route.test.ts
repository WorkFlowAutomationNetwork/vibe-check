import { describe, it, expect, vi, beforeEach } from 'vitest'

const badgeSingle = vi.fn()
const scanSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'badges') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: badgeSingle }) }) }) }
      }
      if (table === 'scans') {
        return { select: () => ({ eq: () => ({ single: scanSingle }) }) }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

import { GET } from './route'

function call(token = 'tok-1') {
  return GET(new Request(`http://localhost/api/badge/${token}/image`), { params: { token } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/badge/[token]/image', () => {
  it('renders the active pill with the grade colour when the badge is active and not expired', async () => {
    badgeSingle.mockResolvedValue({
      data: { status: 'active', expires_at: new Date(Date.now() + 86400_000).toISOString(), scan_id: 'scan-1' },
    })
    scanSingle.mockResolvedValue({ data: { grade: 'A' } })

    const res = await call()
    const svg = await res.text()

    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(svg).toContain('width="168" height="34"')
    expect(svg).toContain('fill="#0F0F0E"') // shadow + label use ink
    expect(svg).toContain('>A</text>')
    expect(svg).toContain('#16a34a') // grade A colour
    expect(svg).not.toContain('text-decoration')
  })

  it('renders the muted, strikethrough lapsed pill when there is no active badge row', async () => {
    badgeSingle.mockResolvedValue({ data: null })

    const res = await call()
    const svg = await res.text()

    expect(svg).toContain('text-decoration="line-through"')
    expect(svg).toContain('#8A8A82') // muted circle/label/stroke
    expect(scanSingle).not.toHaveBeenCalled()
  })

  it('renders the lapsed pill when the badge row is active but past its expiry', async () => {
    badgeSingle.mockResolvedValue({
      data: { status: 'active', expires_at: new Date(Date.now() - 86400_000).toISOString(), scan_id: 'scan-1' },
    })

    const res = await call()
    const svg = await res.text()

    expect(svg).toContain('text-decoration="line-through"')
    expect(scanSingle).not.toHaveBeenCalled()
  })

  it('omits the grade text when the badge is active but the scan has no grade yet', async () => {
    badgeSingle.mockResolvedValue({
      data: { status: 'active', expires_at: null, scan_id: 'scan-1' },
    })
    scanSingle.mockResolvedValue({ data: { grade: null } })

    const res = await call()
    const svg = await res.text()

    expect(svg).toContain('fill="#7C3AED"') // active violet circle
    expect(svg).not.toContain('text-decoration')
    expect(svg).not.toMatch(/font-weight="800"/) // no grade-letter text element at all
  })
})
