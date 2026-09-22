import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import SigninPage from './page'

describe('SigninPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
    refreshMock.mockClear()
    global.fetch = vi.fn()
  })

  it('submits the form and redirects to the play page on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', username: 'mimi' }),
    } as Response)

    render(<SigninPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
  })

  it('shows an error message when login fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Incorrect username or PIN' }),
    } as Response)

    render(<SigninPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '0000' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or PIN')
  })
})
