import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HomePage from './page'

describe('HomePage', () => {
  it('renders the app name', () => {
    render(<HomePage />)
    expect(screen.getByText('Canto')).toBeInTheDocument()
  })
})
