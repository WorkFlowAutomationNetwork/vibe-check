// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------
const getUserMock = vi.fn()
const updateUserMock = vi.fn()
const signOutMock = vi.fn()
const pushMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      updateUser: updateUserMock,
      signOut: signOutMock,
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import UpdatePasswordPage from './page'

function fillPasswords(pw: string, confirm: string) {
  fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: pw } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm } })
}

beforeEach(() => {
  // Default: a valid recovery session (callback exchanged the code + logged in).
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } })
  updateUserMock.mockReset().mockResolvedValue({ error: null })
  signOutMock.mockReset().mockResolvedValue({ error: null })
  pushMock.mockReset()
})

afterEach(() => cleanup())

describe('UpdatePasswordPage — no recovery session', () => {
  it('shows an invalid/expired message and no password form', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    render(<UpdatePasswordPage />)

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
    expect(updateUserMock).not.toHaveBeenCalled()
  })
})

describe('UpdatePasswordPage — valid recovery session', () => {
  it('renders the new-password form once the session is verified', async () => {
    render(<UpdatePasswordPage />)
    expect(await screen.findByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('rejects mismatched passwords without calling updateUser', async () => {
    render(<UpdatePasswordPage />)
    await screen.findByLabelText(/new password/i)
    fillPasswords('longenough1', 'different1')
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('rejects a too-short password without calling updateUser', async () => {
    render(<UpdatePasswordPage />)
    await screen.findByLabelText(/new password/i)
    fillPasswords('short', 'short')
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('updates the password, signs out, and confirms with a sign-in link', async () => {
    render(<UpdatePasswordPage />)
    await screen.findByLabelText(/new password/i)
    fillPasswords('newpassword1', 'newpassword1')
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1))
    expect(updateUserMock.mock.calls[0][0]).toEqual({ password: 'newpassword1' })
    // Recovery session must be torn down so the user logs in fresh.
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1))

    expect(await screen.findByText(/password has been updated/i)).toBeInTheDocument()
    // No password form left, and a clear path back to sign in.
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(pushMock).toHaveBeenCalledWith('/sign-in?reset=success')
  })

  it('shows the error and keeps the form when the update fails', async () => {
    updateUserMock.mockResolvedValueOnce({ error: { message: 'New password should be different' } })
    render(<UpdatePasswordPage />)
    await screen.findByLabelText(/new password/i)
    fillPasswords('newpassword1', 'newpassword1')
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/should be different/i)).toBeInTheDocument()
    expect(signOutMock).not.toHaveBeenCalled()
    // Form is still there so the user can retry.
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  })
})
