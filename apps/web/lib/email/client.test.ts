import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: mockSend } })),
}))

import { sendEmail } from './client'

beforeEach(() => { mockSend.mockReset() })

describe('sendEmail', () => {
  it('calls resend.emails.send with correct params', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendEmail({ to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' })
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      })
    )
  })

  it('swallows errors and resolves void', async () => {
    mockSend.mockRejectedValue(new Error('network error'))
    await expect(sendEmail({ to: 'x@x.com', subject: 'S', html: '' })).resolves.toBeUndefined()
  })

  it('does not throw when resend returns an error object', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'invalid email' } })
    await expect(sendEmail({ to: 'bad', subject: 'S', html: '' })).resolves.toBeUndefined()
  })
})
