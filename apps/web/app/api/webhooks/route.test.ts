import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiKeySingle = vi.fn()
const urlsIs = vi.fn()
const activeMaybeSingle = vi.fn()
const insertSingle = vi.fn()
const fetchMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'api_keys') {
        return { select: () => ({ eq: () => ({ is: () => ({ single: apiKeySingle }) }) }) }
      }
      if (table === 'urls') {
        return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: urlsIs }) }) }) }) }
      }
      if (table === 'scans') {
        return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: activeMaybeSingle }) }) }),
          insert: () => ({ select: () => ({ single: insertSingle }) }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

vi.stubGlobal('fetch', fetchMock)

import { POST } from './route'

function call(opts: { key?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.key !== null) headers['x-vibe-check-key'] = opts.key ?? 'raw-key'
  return POST(
    new Request('http://localhost/api/webhooks', {
      method: 'POST',
      headers,
      body: JSON.stringify(opts.body ?? { url: 'https://deployed.example.com' }),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SCANNER_API_URL = 'https://scanner.example.com'
  process.env.SCANNER_INTERNAL_KEY = 'internal'
  apiKeySingle.mockResolvedValue({ data: { id: 'key-1', user_id: 'user-1' } })
  urlsIs.mockResolvedValue({ data: [{ id: 'url-1' }] })
  activeMaybeSingle.mockResolvedValue({ data: null })
  insertSingle.mockResolvedValue({ data: { id: 'scan-1' } })
  fetchMock.mockResolvedValue({ ok: true })
})

describe('POST /api/webhooks', () => {
  it('returns 401 when the x-vibe-check-key header is missing', async () => {
    const res = await call({ key: null })
    expect(res.status).toBe(401)
    expect(apiKeySingle).not.toHaveBeenCalled()
  })

  it('returns 401 when the key hash matches no active api_key', async () => {
    apiKeySingle.mockResolvedValue({ data: null })
    const res = await call()
    expect(res.status).toBe(401)
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('returns 422 on a malformed payload (non-URL url)', async () => {
    const res = await call({ body: { url: 'not-a-url' } })
    expect(res.status).toBe(422)
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('returns queued:0 when the user has no eligible continuous-monitoring URLs', async () => {
    urlsIs.mockResolvedValue({ data: [] })
    const res = await call()
    expect(await res.json()).toEqual({ queued: 0 })
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('enqueues and dispatches a scan for an eligible URL', async () => {
    const res = await call()
    expect(await res.json()).toEqual({ queued: 1 })
    expect(insertSingle).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://scanner.example.com/api/scans',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('skips a URL that already has a pending/running scan', async () => {
    activeMaybeSingle.mockResolvedValue({ data: { id: 'in-flight' } })
    const res = await call()
    expect(await res.json()).toEqual({ queued: 0 })
    expect(insertSingle).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not count a scan the scanner failed to accept', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const res = await call()
    expect(await res.json()).toEqual({ queued: 0 })
    expect(insertSingle).toHaveBeenCalled()
  })
})
