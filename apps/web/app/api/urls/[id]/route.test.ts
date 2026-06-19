import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mocks ---
const getUser = vi.fn()
const logActivity = vi.fn()

// Mutable handles the test sets per-case.
let urlSelectResult: { data: unknown } = { data: null }
let scanCountResult: { count: number } = { count: 0 }
let deleteResult: { error: unknown } = { error: null }
const deleteEq = vi.fn()
const selectEq = vi.fn()
const selectIs = vi.fn()

function makeClient() {
  return {
    auth: { getUser },
    from(table: string) {
      if (table === 'urls') {
        return {
          // SELECT chain: .select().eq().eq().is().maybeSingle()
          select: () => ({
            eq: (...args1: unknown[]) => {
              selectEq(...args1)
              return {
                eq: (...args2: unknown[]) => {
                  selectEq(...args2)
                  return {
                    is: (...args3: unknown[]) => {
                      selectIs(...args3)
                      return {
                        maybeSingle: async () => urlSelectResult,
                      }
                    },
                  }
                },
              }
            },
          }),
          // DELETE chain: .delete().eq().eq()
          delete: () => ({
            eq: () => ({
              eq: (...args: unknown[]) => {
                deleteEq(...args)
                return Promise.resolve(deleteResult)
              },
            }),
          }),
        }
      }
      if (table === 'scans') {
        return {
          select: () => ({
            eq: async () => scanCountResult,
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => makeClient(),
}))
vi.mock('@/lib/activity', () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}))

import { DELETE } from './route'

function call(id = 'url-1') {
  return DELETE(new Request('http://localhost/api/urls/' + id, { method: 'DELETE' }), {
    params: { id },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  urlSelectResult = { data: { id: 'url-1', url: 'https://example.com' } }
  scanCountResult = { count: 0 }
  deleteResult = { error: null }
})

describe('DELETE /api/urls/[id]', () => {
  it('401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('404 when URL not found or not owned', async () => {
    urlSelectResult = { data: null }
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('409 when the URL has scans', async () => {
    scanCountResult = { count: 2 }
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'url_has_scans' })
  })

  it('500 when the delete fails', async () => {
    deleteResult = { error: { message: 'boom' } }
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'delete_failed' })
  })

  it('200 deletes, logs url_removed with no url_id', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(deleteEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(selectEq).toHaveBeenCalledWith('id', 'url-1')
    expect(selectEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(selectIs).toHaveBeenCalledWith('deleted_at', null)
    expect(logActivity).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'url_removed',
      payload: { url: 'https://example.com' },
    })
  })
})
