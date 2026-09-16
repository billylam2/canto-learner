import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Header } from './header'

describe('Header', () => {
  it('renders the Canto wordmark', () => {
    render(<Header />)
    expect(screen.getByText('Canto')).toBeInTheDocument()
  })

  it('does not show a back link by default', () => {
    render(<Header />)
    expect(screen.queryByRole('link', { name: /levels/i })).not.toBeInTheDocument()
  })

  it('shows a back-to-levels link when showBackLink is true', () => {
    render(<Header showBackLink />)
    expect(screen.getByRole('link', { name: /levels/i })).toHaveAttribute('href', '/play')
  })
})
