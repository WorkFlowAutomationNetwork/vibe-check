import { describe, it, expect } from 'vitest'
import { welcomeEmail } from './welcome'

describe('welcomeEmail', () => {
  it('returns correct subject', () => {
    const { subject } = welcomeEmail('alice@example.com')
    expect(subject).toBe('Welcome to Vibe-Check')
  })

  it('html contains dashboard link', () => {
    const { html } = welcomeEmail('alice@example.com')
    expect(html).toContain('https://vibe-check-app.com/dashboard')
  })

  it('html contains user email', () => {
    const { html } = welcomeEmail('alice@example.com')
    expect(html).toContain('alice@example.com')
  })
})
