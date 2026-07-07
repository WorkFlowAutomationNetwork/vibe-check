// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------
const resetMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: resetMock } }),
}))

// next/script: render nothing but fire the ready callbacks so the
// Turnstile-ready path runs (the component uses onReady).
vi.mock('next/script', () => ({
  default: ({ onLoad, onReady }: { onLoad?: () => void; onReady?: () => void }) => {
    onLoad?.()
    onReady?.()
    return null
  },
}))

import ResetPasswordPage from './page'

// Captures the callback Turnstile would invoke when the user solves the widget.
let turnstileCallback: ((token: string) => void) | null = null

function installTurnstile() {
  turnstileCallback = null
  window.turnstile = {
    render: (_el, opts) => {
      turnstileCallback = opts.callback
      return 'widget-1'
    },
    reset: vi.fn(),
    remove: vi.fn(),
  }
}

function fillEmail() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
}

beforeEach(() => {
  resetMock.mockReset().mockResolvedValue({ error: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  delete window.turnstile
})

describe('ResetPasswordPage — captcha disabled (no site key)', () => {
  it('sends the reset without a captchaToken and shows confirmation', async () => {
    render(<ResetPasswordPage />)
    fillEmail()
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(1))
    const opts = resetMock.mock.calls[0][1]
    expect(opts.captchaToken).toBeUndefined()
    expect(await screen.findByText(/reset link sent/i)).toBeInTheDocument()
  })
})

describe('ResetPasswordPage — captcha enabled', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
    installTurnstile()
  })

  it('blocks submit until the captcha is solved', async () => {
    render(<ResetPasswordPage />)
    fillEmail()

    const submit = screen.getByRole('button', { name: /send reset link/i })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(resetMock).not.toHaveBeenCalled()
  })

  it('sends the captchaToken once the widget is solved', async () => {
    render(<ResetPasswordPage />)
    fillEmail()

    await waitFor(() => expect(turnstileCallback).toBeTypeOf('function'))
    turnstileCallback!('tok-abc')

    const submit = screen.getByRole('button', { name: /send reset link/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(1))
    expect(resetMock.mock.calls[0][1].captchaToken).toBe('tok-abc')
  })

  it('resets the widget and re-blocks submit after a failed send', async () => {
    resetMock.mockResolvedValueOnce({ error: { message: 'Something went wrong' } })
    render(<ResetPasswordPage />)
    fillEmail()
    await waitFor(() => expect(turnstileCallback).toBeTypeOf('function'))
    turnstileCallback!('tok-abc')

    const submit = screen.getByRole('button', { name: /send reset link/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    expect(window.turnstile!.reset).toHaveBeenCalledWith('widget-1')
    await waitFor(() => expect(submit).toBeDisabled())
  })
})
