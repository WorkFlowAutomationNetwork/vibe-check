// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------
const signInMock = vi.fn()
const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword: signInMock } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

// next/script: render nothing but fire onLoad so the Turnstile-ready path runs.
vi.mock('next/script', () => ({
  default: ({ onLoad }: { onLoad?: () => void }) => {
    onLoad?.()
    return null
  },
}))

import SignInPage from './page'

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

function fillForm() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } })
}

beforeEach(() => {
  signInMock.mockReset().mockResolvedValue({ error: null })
  pushMock.mockReset()
  refreshMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  delete window.turnstile
})

describe('SignInPage — captcha disabled (no site key)', () => {
  it('signs in without a captchaToken', async () => {
    render(<SignInPage />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    const arg = signInMock.mock.calls[0][0]
    expect(arg.options?.captchaToken).toBeUndefined()
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('SignInPage — captcha enabled', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
    installTurnstile()
  })

  it('blocks submit until the captcha is solved', async () => {
    render(<SignInPage />)
    fillForm()

    const submit = screen.getByRole('button', { name: /sign in/i })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('sends the captchaToken once the widget is solved', async () => {
    render(<SignInPage />)
    fillForm()

    await waitFor(() => expect(turnstileCallback).toBeTypeOf('function'))
    turnstileCallback!('tok-abc')

    const submit = screen.getByRole('button', { name: /sign in/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    expect(signInMock.mock.calls[0][0].options.captchaToken).toBe('tok-abc')
  })

  it('resets the widget and re-blocks submit after a failed sign-in', async () => {
    signInMock.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    render(<SignInPage />)
    fillForm()
    await waitFor(() => expect(turnstileCallback).toBeTypeOf('function'))
    turnstileCallback!('tok-abc')

    const submit = screen.getByRole('button', { name: /sign in/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    expect(await screen.findByText(/invalid login/i)).toBeInTheDocument()
    expect(window.turnstile!.reset).toHaveBeenCalledWith('widget-1')
    await waitFor(() => expect(submit).toBeDisabled())
  })
})
