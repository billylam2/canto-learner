import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import SignupPage from './page'

describe('SignupPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
    refreshMock.mockClear()
    global.fetch = vi.fn()
  })

  it('submits the form and redirects on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', username: 'mimi' }),
    } as Response)

    render(<SignupPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'))
  })

  it('shows an error message when signup fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'That username is taken' }),
    } as Response)

    render(<SignupPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken')
  })
})
