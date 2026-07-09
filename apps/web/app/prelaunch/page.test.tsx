import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PrelaunchPage from './page'

function render(searchParams: Record<string, string | undefined> = {}) {
  return renderToStaticMarkup(<PrelaunchPage searchParams={searchParams} />)
}

describe('Prelaunch gate page', () => {
  it('shows the coming-soon message and both forms', () => {
    const html = render()
    expect(html).toContain('Sign-ups coming soon')
    expect(html).toContain('Developer access only for now')
    expect(html).toContain('action="/api/prelaunch/unlock"')
    expect(html).toContain('action="/api/prelaunch/notify"')
    expect(html).toContain('name="password"')
    expect(html).toContain('name="email"')
  })

  it('shows a password error only when error=1', () => {
    expect(render()).not.toContain('Incorrect password')
    expect(render({ error: '1' })).toContain('Incorrect password')
  })

  it('shows a thank-you only when notify=ok', () => {
    expect(render()).not.toContain('on the list')
    expect(render({ notify: 'ok' })).toContain('on the list')
  })
})
