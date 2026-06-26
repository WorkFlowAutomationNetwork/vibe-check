// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VercelCard from './VercelCard'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

describe('VercelCard — disconnected', () => {
  it('shows the Connect button when integration is null', () => {
    render(<VercelCard integration={null} />)
    expect(screen.getByRole('button', { name: /connect vercel/i })).toBeInTheDocument()
    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument()
  })

  it('shows the webhook URL after clicking Connect', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ webhookUrl: 'https://app.test/api/webhooks/vercel/abc123' }),
    } as Response)

    render(<VercelCard integration={null} />)
    fireEvent.click(screen.getByRole('button', { name: /connect vercel/i }))

    await waitFor(() => {
      expect(screen.getByText('https://app.test/api/webhooks/vercel/abc123')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })
})

describe('VercelCard — connected, URL unknown', () => {
  const integration = { id: 'int-1', status: 'active', last_triggered_at: null }

  it('shows connected chip and regenerate/disconnect buttons', () => {
    render(<VercelCard integration={integration} />)
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /regenerate url/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
  })

  it('shows "Regenerate to view URL again" when no URL in state', () => {
    render(<VercelCard integration={integration} />)
    expect(screen.getByText(/regenerate to view url again/i)).toBeInTheDocument()
  })

  it('shows the new URL after regenerating', async () => {
    vi.stubGlobal('confirm', () => true)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ webhookUrl: 'https://app.test/api/webhooks/vercel/newtoken' }),
    } as Response)

    render(<VercelCard integration={integration} />)
    fireEvent.click(screen.getByRole('button', { name: /regenerate url/i }))

    await waitFor(() => {
      expect(screen.getByText('https://app.test/api/webhooks/vercel/newtoken')).toBeInTheDocument()
    })
  })

  it('shows the last triggered timestamp when set', () => {
    const withTriggered = { ...integration, last_triggered_at: new Date(Date.now() - 5 * 60000).toISOString() }
    render(<VercelCard integration={withTriggered} />)
    expect(screen.getByText(/last triggered/i)).toBeInTheDocument()
    expect(screen.getByText(/5m ago/i)).toBeInTheDocument()
  })
})

describe('VercelCard — disconnect', () => {
  it('hides connected state after disconnecting', async () => {
    vi.stubGlobal('confirm', () => true)
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)

    render(<VercelCard integration={{ id: 'int-1', status: 'active', last_triggered_at: null }} />)
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect vercel/i })).toBeInTheDocument()
    })
  })
})
