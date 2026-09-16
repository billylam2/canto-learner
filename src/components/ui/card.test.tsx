import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Card } from './card'

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Hello</Card>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('applies the default bordered white style', () => {
    render(<Card>Hello</Card>)
    expect(screen.getByText('Hello')).toHaveClass('bg-white', 'border-brand-ink')
  })

  it('applies a muted style when muted is true', () => {
    render(<Card muted>Hello</Card>)
    expect(screen.getByText('Hello')).toHaveClass('bg-gray-100', 'opacity-70')
  })

  it('merges a passed-in className', () => {
    render(<Card className="text-center">Hello</Card>)
    expect(screen.getByText('Hello')).toHaveClass('text-center')
  })
})
