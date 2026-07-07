// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const listFactors = vi.fn()
const challengeAndVerify = vi.fn()
const push = vi.fn()
let nextParam = '/report/abc'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { mfa: { listFactors, challengeAndVerify } } }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? nextParam : null) }),
}))

import MfaChallengePage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  nextParam = '/report/abc'
  listFactors.mockResolvedValue({ data: { totp: [{ id: 'factor-1' }] } })
  challengeAndVerify.mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('MfaChallengePage', () => {
  it('verifies the code and redirects to the safe next path', async () => {
    render(<MfaChallengePage />)
    await waitFor(() => expect(listFactors).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /^verify/i }))
    await waitFor(() => expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' }))
    expect(push).toHaveBeenCalledWith('/report/abc')
  })

  it('ignores an unsafe next param and falls back to /dashboard', async () => {
    nextParam = 'https://evil.example.com'
    render(<MfaChallengePage />)
    await waitFor(() => expect(listFactors).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /^verify/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('recovers via a backup code and routes to re-enrollment', async () => {
    render(<MfaChallengePage />)
    await waitFor(() => expect(listFactors).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /use a backup code/i }))
    fireEvent.change(screen.getByLabelText(/backup code/i), { target: { value: 'aaaa-1111' } })
    fireEvent.click(screen.getByRole('button', { name: /reset two-factor/i }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/auth/mfa/recover', expect.objectContaining({ method: 'POST' })))
    expect(push).toHaveBeenCalledWith('/mfa/enroll')
  })
})
