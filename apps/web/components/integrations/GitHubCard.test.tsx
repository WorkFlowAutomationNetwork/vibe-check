// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GitHubCard from './GitHubCard'

describe('GitHubCard', () => {
  it('shows a connect CTA and the accurate data-handling copy when not connected', () => {
    render(<GitHubCard installation={null} repos={[]} />)
    expect(screen.getByRole('link', { name: /connect github/i })).toHaveAttribute(
      'href', '/api/integrations/github/install',
    )
    // Accurate copy — full history read, nothing retained, only redacted findings.
    expect(screen.getByText(/full git history/i)).toBeInTheDocument()
    expect(screen.getByText(/never retain your code/i)).toBeInTheDocument()
    expect(screen.getByText(/redacted findings/i)).toBeInTheDocument()
    // The retired CVE-era claim must be gone.
    expect(screen.queryByText(/package\.json and lock files only/i)).not.toBeInTheDocument()
  })

  it('lists connected repos when connected', () => {
    render(
      <GitHubCard
        installation={{ installation_id: 5, account_login: 'me', status: 'active' }}
        repos={[{ id: 'r1', full_name: 'me/app', status: 'active' }]}
      />,
    )
    expect(screen.getByText('me/app')).toBeInTheDocument()
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
  })
})
