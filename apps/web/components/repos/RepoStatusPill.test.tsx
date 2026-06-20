import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RepoStatusPill from './RepoStatusPill'

describe('RepoStatusPill', () => {
  it('shows Never scanned when there is no scan', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={null} />)).toContain('Never scanned')
  })
  it('shows Scanning for an in-flight scan', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'running', secrets_found: null }} />)).toContain('Scanning')
  })
  it('shows Clean when completed with zero secrets', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'completed', secrets_found: 0 }} />)).toContain('Clean')
  })
  it('shows the secret count when completed with secrets', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'completed', secrets_found: 3 }} />)).toContain('3 secrets')
  })
  it('uses the singular for one secret', () => {
    const html = renderToStaticMarkup(<RepoStatusPill scan={{ status: 'completed', secrets_found: 1 }} />)
    expect(html).toContain('1 secret')
    expect(html).not.toContain('1 secrets')
  })
  it('shows Failed for a failed scan', () => {
    expect(renderToStaticMarkup(<RepoStatusPill scan={{ status: 'failed', secrets_found: null }} />)).toContain('Failed')
  })
})
