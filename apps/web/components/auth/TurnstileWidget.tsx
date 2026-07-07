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
        // `render=explicit` disables Cloudflare's implicit auto-render of any
        // `.cf-turnstile` element. Without it, api.js auto-renders our container
        // and races the explicit turnstile.render() in useTurnstile — on
        // reset-password the implicit render won, so the token callback never
        // fired and the submit button stayed disabled ("Turnstile skipped
        // implicit render because a widget already exists in this container").
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        // onReady (not onLoad) fires on every mount, so a soft nav to another
        // auth page re-signals readiness even though api.js is already loaded.
        onReady={onScriptReady}
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
