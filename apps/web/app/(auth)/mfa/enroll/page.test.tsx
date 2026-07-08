// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const listFactors = vi.fn()
const enroll = vi.fn()
const challengeAndVerify = vi.fn()
const unenroll = vi.fn()
const push = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { mfa: { listFactors, enroll, challengeAndVerify, unenroll } },
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

import MfaEnrollPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  listFactors.mockResolvedValue({ data: { all: [] } })
  // Supabase returns qr_code as a complete data: URI, not a bare SVG string.
  enroll.mockResolvedValue({
    data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCDEF' } },
  })
  challengeAndVerify.mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ codes: ['aaaa-1111', 'bbbb-2222'] }),
  }))
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('MfaEnrollPage', () => {
  it('enrolls on mount and shows the secret', async () => {
    render(<MfaEnrollPage />)
    await waitFor(() => expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' }))
    expect(await screen.findByText('ABCDEF')).toBeInTheDocument()
  })

  it('renders the QR code using the data: URI verbatim (no double-wrapping)', async () => {
    render(<MfaEnrollPage />)
    const img = await screen.findByAltText('TOTP QR code')
    // Must be the exact value Supabase returned — re-wrapping it in another
    // `data:image/svg+xml;utf-8,${encodeURIComponent(...)}` produces a broken image.
    expect(img).toHaveAttribute('src', 'data:image/svg+xml;utf-8,<svg/>')
  })

  it('verifies the code, completes enrollment, and shows backup codes', async () => {
    render(<MfaEnrollPage />)
    await screen.findByText('ABCDEF')

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verify & enable/i }))

    await waitFor(() => expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' }))
    expect(fetch).toHaveBeenCalledWith('/api/auth/mfa/enroll-complete', { method: 'POST' })
    expect(await screen.findByText('aaaa-1111')).toBeInTheDocument()
    // Continue is gated until the "I've saved" checkbox is ticked.
    const cont = screen.getByRole('button', { name: /continue to dashboard/i })
    expect(cont).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/i have saved my backup codes/i))
    expect(cont).not.toBeDisabled()
  })

  it('shows an error and clears the code on a bad TOTP code', async () => {
    challengeAndVerify.mockResolvedValue({ error: { message: 'invalid' } })
    render(<MfaEnrollPage />)
    await screen.findByText('ABCDEF')
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /verify & enable/i }))
    expect(await screen.findByText(/not valid/i)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
