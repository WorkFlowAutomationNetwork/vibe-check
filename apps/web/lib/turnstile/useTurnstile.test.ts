// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTurnstile } from './useTurnstile'

afterEach(() => {
  vi.unstubAllEnvs()
  delete window.turnstile
})

const stubTurnstile = () => {
  window.turnstile = { render: () => 'w', reset: vi.fn(), remove: vi.fn() }
}

describe('useTurnstile — script-ready detection', () => {
  it('starts script-ready when Turnstile is already loaded (client-side nav between auth pages)', () => {
    // Regression: navigating sign-in → reset-password is a soft nav. next/script
    // has already loaded api.js and will NOT re-fire onLoad, so the new page must
    // detect the already-present global itself — otherwise the widget only
    // appeared after a hard refresh.
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'k')
    stubTurnstile()
    const { result } = renderHook(() => useTurnstile())
    expect(result.current.scriptReady).toBe(true)
  })

  it('starts not-ready on a cold first load before the script has run', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'k')
    const { result } = renderHook(() => useTurnstile())
    expect(result.current.scriptReady).toBe(false)
  })
})
