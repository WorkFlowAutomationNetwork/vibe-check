'use client'

import Script from 'next/script'

/**
 * Renders the Cloudflare Turnstile script + widget container. Pair with the
 * useTurnstile() hook: pass its `widgetRef` (a callback ref) and `onScriptReady`.
 * Only render this when `useTurnstile().enabled` is true.
 */
export function TurnstileWidget({
  widgetRef,
  onScriptReady,
}: {
  widgetRef: (el: HTMLDivElement | null) => void
  onScriptReady: () => void
}) {
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={onScriptReady}
      />
      <div
        ref={widgetRef}
        className="cf-turnstile"
        style={{ margin: '0 0 16px' }}
        aria-label="Verification challenge"
      />
    </>
  )
}
