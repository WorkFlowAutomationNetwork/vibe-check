// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import ScanRepoButton from './ScanRepoButton'

beforeEach(() => { refreshMock.mockClear() })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('ScanRepoButton', () => {
  it('starts a scan and shows the scanning state on 202', async () => {
    const fetchMock = vi.fn(async () => ({ status: 202, json: async () => ({ repo_scan_id: 's1' }) }))
    vi.stubGlobal('fetch', fetchMock as any)

    render(<ScanRepoButton repoId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /scan now/i }))

    expect(await screen.findByRole('button', { name: /scanning/i })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith('/api/repo-scans', expect.objectContaining({ method: 'POST' }))
  })

  it('resumes polling on 409 and refreshes when the scan completes', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 409, json: async () => ({ repo_scan_id: 's9' }) }) // POST
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'completed' }) })        // GET poll
    vi.stubGlobal('fetch', fetchMock as any)

    render(<ScanRepoButton repoId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /scan now/i }))

    await vi.advanceTimersByTimeAsync(0)     // flush the POST
    await vi.advanceTimersByTimeAsync(3000)  // first poll → completed

    expect(fetchMock).toHaveBeenCalledWith('/api/repo-scans?id=s9')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('polls immediately when an in-flight scan id is provided', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'running' }) }))
    vi.stubGlobal('fetch', fetchMock as any)

    render(<ScanRepoButton repoId="r1" activeScanId="s5" />)
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled()

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledWith('/api/repo-scans?id=s5')
  })

  it('shows an inline error when the scan cannot be started', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 502, json: async () => ({}) })) as any)
    render(<ScanRepoButton repoId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /scan now/i }))
    expect(await screen.findByText(/start scan/i)).toBeInTheDocument()
  })
})
