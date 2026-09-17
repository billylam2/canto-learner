import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { GuestPlayPage } from './guest-play-page'

describe('GuestPlayPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
  })

  it('shows a reset-progress button', async () => {
    render(<GuestPlayPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /reset progress/i })).toBeInTheDocument())
  })

  it('links to the pet page', async () => {
    render(<GuestPlayPage />)
    await waitFor(() => expect(screen.getByRole('link', { name: /my pet/i })).toHaveAttribute('href', '/pet'))
  })
})
