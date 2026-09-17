import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const redirectMock = vi.fn()
const getMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url)
    throw new Error(`REDIRECT:${url}`)
  },
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
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
  it('renders the guest play page when there is no session, without redirecting to login', async () => {
    getMock.mockReturnValue(undefined)
    render(await PlayPage())
    expect(screen.getByText('Choose a level')).toBeInTheDocument()
    expect(redirectMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument()
  })

  it('shows unlocked levels with a Listen & Tap link and locked levels as plain text', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    // Level 1 (Greetings) has 8 vocab items, so its max is 8 * 3 = 24 stars.
    expect(within(greetingsItem as HTMLElement).getByText('10 / 24 stars')).toBeInTheDocument()
    expect(within(greetingsItem as HTMLElement).getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute(
      'href',
      '/play/1'
    )
    // Completing level 1's listen-tap also unlocks level 2 (People & Family)
    // in the new chain model, but level 3 stays locked until level 2's own
    // find-scene is completed.
    expect(screen.getByText(/Descriptors & Animals — locked — finish the previous level first/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
    // The pet reward system is disabled for now (REWARDS_ENABLED is false).
    expect(screen.queryByRole('link', { name: /my pet/i })).not.toBeInTheDocument()
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
    // scene link regardless of unlock state.
    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    expect(within(greetingsItem as HTMLElement).queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })
})
