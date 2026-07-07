import { describe, it, expect } from 'vitest'
import { scanCompleteEmail } from './scan-complete'

const base = { url: 'https://example.com', grade: 'B', scanId: 'scan-123', hasCritical: false }

describe('scanCompleteEmail', () => {
  it('subject contains grade when no critical findings', () => {
    const { subject } = scanCompleteEmail(base)
    expect(subject).toBe('Your scan is ready — Grade B')
  })

  it('subject signals critical when hasCritical is true', () => {
    const { subject } = scanCompleteEmail({ ...base, hasCritical: true })
    expect(subject).toContain('Critical')
  })

  it('html contains the report URL', () => {
    const { html } = scanCompleteEmail(base)
    expect(html).toContain('https://vibe-check-app.com/report/scan-123')
  })

  it('html contains the scanned URL', () => {
    const { html } = scanCompleteEmail(base)
    expect(html).toContain('https://example.com')
  })

  it('html contains critical warning section when hasCritical is true', () => {
    const { html } = scanCompleteEmail({ ...base, hasCritical: true })
    expect(html).toContain('Critical issues')
  })

  it('html does NOT contain critical warning when hasCritical is false', () => {
    const { html } = scanCompleteEmail(base)
    expect(html).not.toContain('Critical issues')
  })
})
