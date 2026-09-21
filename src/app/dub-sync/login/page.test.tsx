import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

import DubSyncLoginPage from './page'

describe('DubSyncLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits the password and navigates to the admin page on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) }))
    render(<DubSyncLoginPage />)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dub-sync/admin'))
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ password: 'secret-pass' }) })
    )
  })

  it('shows an error message on an incorrect password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<DubSyncLoginPage />)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password'))
  })
})
