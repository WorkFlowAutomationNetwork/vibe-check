// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Surface next/script's props by rendering a real <script> we can inspect.
// `async` mirrors how next/script actually injects the tag and keeps the
// @next/next/no-sync-scripts lint rule (which runs during `next build`) happy.
vi.mock('next/script', () => ({
  default: (props: { src?: string }) => (
    <script data-testid="turnstile-script" src={props.src} async />
  ),
}))

import { TurnstileWidget } from './TurnstileWidget'

describe('TurnstileWidget', () => {
  it('loads api.js in explicit-render mode so Cloudflare does not also auto-render the container', () => {
    // Regression: without ?render=explicit, api.js auto-renders the .cf-turnstile
    // div (implicit) and races our explicit turnstile.render(). On reset-password
    // the implicit render won, the token callback never fired, and the submit
    // button stayed disabled. Explicit mode disables the auto-scan entirely.
    const { getByTestId } = render(
      <TurnstileWidget widgetRef={() => {}} onScriptReady={() => {}} />,
    )
    const src = getByTestId('turnstile-script').getAttribute('src') ?? ''
    expect(src).toContain('challenges.cloudflare.com/turnstile/v0/api.js')
    expect(src).toContain('render=explicit')
  })

  it('renders the container element the widget mounts into', () => {
    const { container } = render(
      <TurnstileWidget widgetRef={() => {}} onScriptReady={() => {}} />,
    )
    expect(container.querySelector('.cf-turnstile')).toBeTruthy()
  })
})
