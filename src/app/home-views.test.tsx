import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import { GuestHome, AuthenticatedHome } from './home-views'

describe('GuestHome', () => {
  it('shows links to signup and login', () => {
    render(<GuestHome />)
    expect(screen.getByText('Create an account')).toBeInTheDocument()
    expect(screen.getByText('Log in')).toBeInTheDocument()
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

  it('logs out and redirects to login', async () => {
    render(<AuthenticatedHome username="mimi" />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'))
  })
})
