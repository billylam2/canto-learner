import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const redirectMock = vi.fn()
const getMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url)
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/progress', () => ({
  getProgressForKid: vi.fn(),
}))

import PlayPage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { createSessionCookieValue } from '@/lib/auth/session'

describe('PlayPage', () => {
  it('redirects to login when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    await expect(PlayPage()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })

  it('shows unlocked levels as links and locked levels as plain text', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    expect(screen.getByRole('link', { name: /Greetings/ })).toBeInTheDocument()
    expect(screen.getByText(/People & Family — locked/)).toBeInTheDocument()
  })
})
