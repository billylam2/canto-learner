import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn()
const notFoundMock = vi.fn()
const getMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url)
    throw new Error(`REDIRECT:${url}`)
  },
  notFound: () => {
    notFoundMock()
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/progress', () => ({
  getProgressForKid: vi.fn(),
}))
vi.mock('@/lib/db/content', () => ({
  getVocabItemsForLevel: vi.fn(),
}))
vi.mock('./listen-tap-game', () => ({
  ListenTapGame: ({ levelName }: { levelName: string }) => <div>Playing {levelName}</div>,
}))
vi.mock('@/components/guest-level-gate', () => ({
  GuestLevelGate: ({
    levelId,
    gameType,
    children,
  }: {
    levelId: number
    gameType: string
    children: (onLevelComplete: (stars: number) => void) => React.ReactNode
  }) => (
    <div>
      Guest gate for level {levelId} ({gameType})
      {children(() => {})}
    </div>
  ),
}))

import LevelPage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { getVocabItemsForLevel } from '@/lib/db/content'
import { createSessionCookieValue } from '@/lib/auth/session'

function makeParams(levelId: string) {
  return Promise.resolve({ levelId })
}

describe('LevelPage', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    notFoundMock.mockClear()
  })

  it('calls notFound for an unknown level id', async () => {
    await expect(LevelPage({ params: makeParams('999') })).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('renders the guest-gated game when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    vi.mocked(getVocabItemsForLevel).mockResolvedValue([])

    render(await LevelPage({ params: makeParams('1') }))
    expect(screen.getByText('Playing Greetings')).toBeInTheDocument()
    expect(screen.getByText('Guest gate for level 1 (listen-tap)')).toBeInTheDocument()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('redirects to /play when the level is locked', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])

    await expect(LevelPage({ params: makeParams('2') })).rejects.toThrow('REDIRECT:/play')
  })

  it('renders the game when the level is unlocked', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getVocabItemsForLevel).mockResolvedValue([])

    render(await LevelPage({ params: makeParams('1') }))
    expect(screen.getByText('Playing Greetings')).toBeInTheDocument()
  })
})
