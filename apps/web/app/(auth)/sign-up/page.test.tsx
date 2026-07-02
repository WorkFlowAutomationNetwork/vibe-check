// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------
const signUpMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signUp: signUpMock } }),
}))

// next/script: render nothing but fire onLoad so the Turnstile-ready path runs.
vi.mock('next/script', () => ({
  default: ({ onLoad }: { onLoad?: () => void }) => {
    onLoad?.()
    return null
  },
}))

import SignUpPage from './page'

// Captures the callback Turnstile would invoke when the user solves the widget,
// so tests can simulate a solved captcha.
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

async function fillFormAndAcceptTerms() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } })
  fireEvent.click(screen.getByLabelText(/accept terms/i))
}

beforeEach(() => {
  signUpMock.mockReset().mockResolvedValue({ error: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  delete window.turnstile
})

describe('SignUpPage — captcha disabled (no site key)', () => {
  it('submits without a captchaToken and reaches the confirm screen', async () => {
    render(<SignUpPage />)
    await fillFormAndAcceptTerms()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1))
    const arg = signUpMock.mock.calls[0][0]
    expect(arg.options.captchaToken).toBeUndefined()
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })
})

describe('SignUpPage — captcha enabled', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
    installTurnstile()
  })

  it('blocks submit until the captcha is solved', async () => {
    render(<SignUpPage />)
    await fillFormAndAcceptTerms()

    // Terms accepted but captcha not solved => still disabled, no signUp.
    const submit = screen.getByRole('button', { name: /create account/i })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('sends the captchaToken once the widget is solved', async () => {
    render(<SignUpPage />)
    await fillFormAndAcceptTerms()

    // Simulate the user solving the Turnstile challenge.
    await waitFor(() => expect(turnstileCallback).toBeTypeOf('function'))
    turnstileCallback!('tok-abc')

    const submit = screen.getByRole('button', { name: /create account/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1))
    expect(signUpMock.mock.calls[0][0].options.captchaToken).toBe('tok-abc')
  })

  it('resets the widget and re-blocks submit after a failed sign-up', async () => {
    signUpMock.mockResolvedValueOnce({ error: { message: 'Email already registered' } })
    render(<SignUpPage />)
    await fillFormAndAcceptTerms()
    await waitFor(() => expect(turnstileCallback).toBeTypeOf('function'))
    turnstileCallback!('tok-abc')

    const submit = screen.getByRole('button', { name: /create account/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    // Error shown, widget reset, token cleared => submit disabled again.
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
    expect(window.turnstile!.reset).toHaveBeenCalledWith('widget-1')
    await waitFor(() => expect(submit).toBeDisabled())
  })
})
