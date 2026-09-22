import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import { GuestHome, AuthenticatedHome } from './home-views'

describe('GuestHome', () => {
  it('shows a prominent guest-play action alongside signup and login links', () => {
    render(<GuestHome />)
    expect(screen.getByRole('link', { name: 'Play as guest' })).toHaveAttribute('href', '/play')
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/signin')
  })
})

describe('AuthenticatedHome', () => {
  beforeEach(() => {
    pushMock.mockClear()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
  })

  it('shows a welcome message with the username', () => {
    render(<AuthenticatedHome username="mimi" />)
    expect(screen.getByText('Welcome back, mimi!')).toBeInTheDocument()
  })

  it('logs out via the header and navigates to the login gate', async () => {
    render(<AuthenticatedHome username="mimi" />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'))
  })

  it('links to the play page', () => {
    render(<AuthenticatedHome username="mimi" />)
    expect(screen.getByRole('link', { name: /play/i })).toHaveAttribute('href', '/play')
  })
})
