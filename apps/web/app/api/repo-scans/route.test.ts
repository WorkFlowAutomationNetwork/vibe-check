import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: any = {}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => state.client,
  createServiceClient: () => state.serviceClient ?? state.client,
}))

function makeClient(over: any = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: over.from,
  }
}

describe('POST /api/repo-scans', () => {
  beforeEach(() => {
    state.client = null
    vi.restoreAllMocks()
    process.env.SCANNER_API_URL = 'http://scanner'
    process.env.SCANNER_INTERNAL_KEY = 'k'
  })

  it('rejects an unverified/foreign repo with 404', async () => {
    state.client = makeClient({
      from: (table: string) => {
        if (table === 'my_entitlements') return {
          select: () => ({ maybeSingle: async () => ({ data: { can_integrations: true } }) }),
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
                single: async () => ({ data: null }),
              }),
              single: async () => ({ data: null }),
            }),
          }),
        }
      },
    })
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/repo-scans', {
      method: 'POST', body: JSON.stringify({ repo_id: '11111111-1111-1111-1111-111111111111' }),
    }))
    expect(res.status).toBe(404)
  })

  it('rejects with 403 when the plan lacks the integrations entitlement', async () => {
    state.client = makeClient({
      from: (table: string) => ({
        select: () => ({
          maybeSingle: async () => ({ data: table === 'my_entitlements' ? { can_integrations: false } : null }),
        }),
      }),
    })
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/repo-scans', {
      method: 'POST', body: JSON.stringify({ repo_id: '11111111-1111-1111-1111-111111111111' }),
    }))
    expect(res.status).toBe(403)
  })

  it('picks full mode and dispatches for a never-scanned repo', async () => {
    const inserted = { id: 'scan-1' }
    const calls: any = { insertMode: null }
    state.client = makeClient({
      from: (table: string) => {
        if (table === 'my_entitlements') return {
          select: () => ({ maybeSingle: async () => ({ data: { can_integrations: true } }) }),
        }
        if (table === 'repos') return {
          select: () => ({ eq: () => ({ eq: () => ({
            single: async () => ({ data: { id: 'repo-1', status: 'active', last_scanned_sha: null } }),
          }) }) }),
        }
        // repo_scans: active-check then insert
        return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
          insert: (row: any) => { calls.insertMode = row.mode; return {
            select: () => ({ single: async () => ({ data: inserted, error: null }) }) } },
          delete: () => ({ eq: async () => ({}) }),
        }
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })) as any)
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/repo-scans', {
      method: 'POST', body: JSON.stringify({ repo_id: '11111111-1111-1111-1111-111111111111' }),
    }))
    expect(res.status).toBe(202)
    expect(calls.insertMode).toBe('full')
    expect(await res.json()).toEqual({ repo_scan_id: 'scan-1' })
  })
})
