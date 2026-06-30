// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VercelCard from './VercelCard'

describe('VercelCard', () => {
  it('renders coming soon state', () => {
    render(<VercelCard />)
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /coming soon/i })).toBeDisabled()
  })

  it('shows the Vercel description', () => {
    render(<VercelCard />)
    expect(screen.getByText(/deploy-triggered re-scans/i)).toBeInTheDocument()
  })
})
