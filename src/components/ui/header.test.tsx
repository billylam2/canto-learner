import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import { Header } from './header'

describe('Header', () => {
  beforeEach(() => {
    pushMock.mockClear()
    refreshMock.mockClear()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
  })

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

  it('does not show a log out button by default', () => {
    render(<Header />)
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument()
  })

  it('logs out and navigates to the main page when showLogout is true', async () => {
    render(<Header showLogout />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))

    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { method: 'POST' })
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'))
  })
})
