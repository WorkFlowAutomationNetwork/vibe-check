import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const urlSingle = vi.fn()
const entitlementsSingle = vi.fn()
const activeScanMaybeSingle = vi.fn()
const insertSingle = vi.fn()
const deleteEq = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === 'urls') {
        return { select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ single: urlSingle }) }) }) }) }
      }
      if (table === 'my_entitlements') {
        return { select: () => ({ single: entitlementsSingle }) }
      }
      if (table === 'scans') {
        return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: activeScanMaybeSingle }) }) }),
          insert: () => ({ select: () => ({ single: insertSingle }) }),
          delete: () => ({ eq: deleteEq }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { POST } from './route'

function call(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/scans', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }))
}

const VALID_BODY = { url_id: '11111111-1111-1111-1111-111111111111', scan_type: 'passive' as const }

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  urlSingle.mockResolvedValue({ data: { id: VALID_BODY.url_id, verified: true } })
  entitlementsSingle.mockResolvedValue({ data: { can_run_scan: true, max_scans_per_month: 1, scans_used_this_period: 0 } })
  activeScanMaybeSingle.mockResolvedValue({ data: null })
  insertSingle.mockResolvedValue({ data: { id: 'scan-1' }, error: null })
  fetchMock.mockResolvedValue({ ok: true })
})

describe('POST /api/scans', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call(VALID_BODY)
    expect(res.status).toBe(401)
  })

  it('returns 402 scan_limit_reached when the plan cap is hit, without inserting a scan', async () => {
    entitlementsSingle.mockResolvedValue({ data: { can_run_scan: false, max_scans_per_month: 1, scans_used_this_period: 1 } })
    const res = await call(VALID_BODY)
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: 'scan_limit_reached', max_scans_per_month: 1, scans_used_this_period: 1 }),
    )
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('returns 409 when a scan is already pending/running for this URL', async () => {
    activeScanMaybeSingle.mockResolvedValue({ data: { id: 'in-flight' } })
    const res = await call(VALID_BODY)
    expect(res.status).toBe(409)
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('enqueues a scan and dispatches to the scanner on success', async () => {
    const res = await call(VALID_BODY)
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ scan_id: 'scan-1' })
    expect(fetchMock).toHaveBeenCalled()
  })
})
