import { render, screen, within } from '@testing-library/react'
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

  it('shows unlocked levels with a Listen & Tap link and locked levels as plain text', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    expect(screen.getByText(/Greetings — 10 stars/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute('href', '/play/1')
    expect(screen.getByText(/People & Family — locked/)).toBeInTheDocument()
  })

  it('shows a Find in the Scene link only for unlocked levels that have scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 200, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    // Level 1 (Greetings) has no scene content, so its list item gets no
    // scene link even though it (and every other level) is unlocked.
    const greetingsItem = screen.getByText(/Greetings — 200 stars/).closest('li')
    expect(greetingsItem).not.toBeNull()
    expect(within(greetingsItem as HTMLElement).queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })
})
