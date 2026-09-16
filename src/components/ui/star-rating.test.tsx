import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StarRating } from './star-rating'

describe('StarRating', () => {
  it('renders the star count as text', () => {
    render(<StarRating stars={24} />)
    expect(screen.getByText('24 stars')).toBeInTheDocument()
  })

  it('renders the star icon as decorative (aria-hidden)', () => {
    const { container } = render(<StarRating stars={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
