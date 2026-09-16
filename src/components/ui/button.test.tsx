import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button, LinkButton } from './button'

describe('Button', () => {
  it('renders its children and responds to clicks', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Play!</Button>)
    screen.getByRole('button', { name: 'Play!' }).click()
    expect(onClick).toHaveBeenCalled()
  })

  it('applies the primary variant by default', () => {
    render(<Button>Play!</Button>)
    expect(screen.getByRole('button', { name: 'Play!' })).toHaveClass('bg-brand-primary')
  })

  it('applies the secondary variant when specified', () => {
    render(<Button variant="secondary">Play!</Button>)
    expect(screen.getByRole('button', { name: 'Play!' })).toHaveClass('bg-white')
  })

  it('forwards standard button attributes like disabled and type', () => {
    render(
      <Button disabled type="submit">
        Play!
      </Button>
    )
    const button = screen.getByRole('button', { name: 'Play!' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('type', 'submit')
  })
})

describe('LinkButton', () => {
  it('renders as a link with the given href', () => {
    render(<LinkButton href="/play">Play!</LinkButton>)
    expect(screen.getByRole('link', { name: 'Play!' })).toHaveAttribute('href', '/play')
  })

  it('applies the primary variant by default', () => {
    render(<LinkButton href="/play">Play!</LinkButton>)
    expect(screen.getByRole('link', { name: 'Play!' })).toHaveClass('bg-brand-primary')
  })

  it('applies the secondary variant when specified', () => {
    render(
      <LinkButton href="/play" variant="secondary">
        Play!
      </LinkButton>
    )
    expect(screen.getByRole('link', { name: 'Play!' })).toHaveClass('bg-white')
  })
})
