import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mocks ---
const getUser = vi.fn()
const logActivity = vi.fn()

// Mutable handles the test sets per-case.
let urlSelectResult: { data: unknown } = { data: null }
let scanCountResult: { count: number } = { count: 0 }
let deleteResult: { error: unknown } = { error: null }
let updateResult: { data: unknown; error: unknown } = { data: null, error: null }
const deleteEq = vi.fn()
const selectEq = vi.fn()
const selectIs = vi.fn()
const updateEq = vi.fn()
const updateIs = vi.fn()
const updateCall = vi.fn()

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
          // UPDATE chain: .update().eq().eq().is().select().maybeSingle()
          update: (...argsU: unknown[]) => {
            updateCall(...argsU)
            return {
              eq: (...args1: unknown[]) => {
                updateEq(...args1)
                return {
                  eq: (...args2: unknown[]) => {
                    updateEq(...args2)
                    return {
                      is: (...args3: unknown[]) => {
                        updateIs(...args3)
                        return {
                          select: () => ({
                            maybeSingle: async () => updateResult,
                          }),
                        }
                      },
                    }
                  },
                }
              },
            }
          },
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

import { DELETE, PATCH } from './route'

function call(id = 'url-1') {
  return DELETE(new Request('http://localhost/api/urls/' + id, { method: 'DELETE' }), {
    params: { id },
  })
}

function patchCall(body: unknown, id = 'url-1') {
  return PATCH(new Request('http://localhost/api/urls/' + id, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }), { params: { id } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  urlSelectResult = { data: { id: 'url-1', url: 'https://example.com' } }
  scanCountResult = { count: 0 }
  deleteResult = { error: null }
  updateResult = { data: { id: 'url-1', public_report_enabled: true }, error: null }
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

describe('PATCH /api/urls/[id]', () => {
  it('401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await patchCall({ public_report_enabled: true })
    expect(res.status).toBe(401)
  })

  it('400 when public_report_enabled is missing or not a boolean', async () => {
    const res = await patchCall({ public_report_enabled: 'yes' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(updateCall).not.toHaveBeenCalled()
  })

  it('404 when the URL is not found, not owned, or soft-deleted', async () => {
    updateResult = { data: null, error: null }
    const res = await patchCall({ public_report_enabled: true })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('500 when the update fails', async () => {
    updateResult = { data: null, error: { message: 'boom' } }
    const res = await patchCall({ public_report_enabled: true })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'update_failed' })
  })

  it('200 updates the flag, scoped to owner + non-deleted, and logs it', async () => {
    const res = await patchCall({ public_report_enabled: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'url-1', public_report_enabled: true })
    expect(updateCall).toHaveBeenCalledWith({ public_report_enabled: true })
    expect(updateEq).toHaveBeenCalledWith('id', 'url-1')
    expect(updateEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(updateIs).toHaveBeenCalledWith('deleted_at', null)
    expect(logActivity).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'url_public_report_toggled',
      payload: { url_id: 'url-1', public_report_enabled: true },
    })
  })
})
