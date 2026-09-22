import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const getMock = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import LoginPage from './page'

describe('LoginPage', () => {
  it('shows the guest view when there is no session cookie', async () => {
    getMock.mockReturnValue(undefined)
    render(await LoginPage())
    expect(screen.getByText('Create an account')).toBeInTheDocument()
  })

  it('shows the authenticated view when a valid session cookie is present', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const { createSessionCookieValue } = await import('@/lib/auth/session')
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })

    render(await LoginPage())
    expect(screen.getByText('Welcome back, mimi!')).toBeInTheDocument()
  })
})
