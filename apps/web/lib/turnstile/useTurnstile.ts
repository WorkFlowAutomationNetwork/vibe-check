'use client'

import { useCallback, useEffect, useState } from 'react'

// Cloudflare Turnstile JS API (loaded via the <Script> in TurnstileWidget).
// Only the members we use are typed.
type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
    },
  ) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/**
 * Shared Cloudflare Turnstile controller for the auth flows (sign-up, sign-in,
 * reset-password). Turnstile is opt-in: with no site key configured (e.g. local
 * dev before the key is set) `enabled` is false, the widget is skipped, and the
 * flow behaves as before.
 *
 * Enable by setting NEXT_PUBLIC_TURNSTILE_SITE_KEY and the matching secret in
 * Supabase → Auth → Attack Protection. Because that Supabase toggle is
 * account-wide, ALL auth endpoints (sign-up, sign-in, recover) must send a
 * token once it's on — hence this shared hook.
 *
 * Explicit render (vs. implicit data-attributes) lets us capture the token into
 * state and reset it after a failed submit — Turnstile tokens are single-use,
 * so a retry needs a fresh one. The container is tracked via a callback ref so
 * the widget is (re)built whenever its container mounts — this is what makes
 * sign-up's form ⇄ "check your email" toggle re-render the widget correctly.
 */
export function useTurnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const enabled = Boolean(siteKey)

  const [token, setToken] = useState<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [widgetId, setWidgetId] = useState<string | null>(null)

  // Callback ref: fires with the element on mount and null on unmount, driving
  // the render effect below via `node`.
  const widgetRef = useCallback((el: HTMLDivElement | null) => setNode(el), [])

  useEffect(() => {
    if (!enabled || !scriptReady || !node) return
    const turnstile = window.turnstile
    if (!turnstile) return

    const id = turnstile.render(node, {
      sitekey: siteKey!,
      callback: t => setToken(t),
      'error-callback': () => setToken(null),
      'expired-callback': () => setToken(null),
    })
    setWidgetId(id)

    return () => {
      window.turnstile?.remove(id)
      setWidgetId(null)
      setToken(null)
    }
  }, [enabled, siteKey, scriptReady, node])

  // Reset the widget after a failed submit so a retry gets a fresh token.
  const reset = useCallback(() => {
    if (enabled && widgetId) {
      window.turnstile?.reset(widgetId)
      setToken(null)
    }
  }, [enabled, widgetId])

  return {
    /** True when a site key is configured; false disables the captcha entirely. */
    enabled,
    /** The solved token, or null. Pass as `captchaToken` to the Supabase call. */
    token,
    /** Callback ref to attach to the widget container element. */
    widgetRef,
    /** Call from the Turnstile script's onLoad. */
    onScriptReady: () => setScriptReady(true),
    /** Whether the Turnstile script has loaded. */
    scriptReady,
    reset,
  }
}
