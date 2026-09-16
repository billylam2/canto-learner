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
vi.mock('@/lib/db/scenes', () => ({
  getScenesForLevel: vi.fn(),
}))
vi.mock('./scene-game', () => ({
  SceneGame: ({ levelName }: { levelName: string }) => <div>Playing scene: {levelName}</div>,
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

import ScenePage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { getScenesForLevel } from '@/lib/db/scenes'
import { createSessionCookieValue } from '@/lib/auth/session'

function makeParams(levelId: string) {
  return Promise.resolve({ levelId })
}

describe('ScenePage', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    notFoundMock.mockClear()
  })

  it('calls notFound for an unknown level id', async () => {
    await expect(ScenePage({ params: makeParams('999') })).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('renders the guest-gated scene game when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    vi.mocked(getScenesForLevel).mockResolvedValue([{ id: 1, imageUrl: 'https://example.com/s.png', objects: [] }])

    render(await ScenePage({ params: makeParams('1') }))
    expect(screen.getByText('Playing scene: Greetings')).toBeInTheDocument()
    expect(screen.getByText('Guest gate for level 1 (find-scene)')).toBeInTheDocument()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('calls notFound for a guest visiting a level with no scenes', async () => {
    getMock.mockReturnValue(undefined)
    vi.mocked(getScenesForLevel).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('1') })).rejects.toThrow('NOT_FOUND')
  })

  it('redirects to /play when the level is locked', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('3') })).rejects.toThrow('REDIRECT:/play')
  })

  it('calls notFound when the unlocked level has no scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getScenesForLevel).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('1') })).rejects.toThrow('NOT_FOUND')
  })

  it('renders the scene game when the level is unlocked and has scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getScenesForLevel).mockResolvedValue([{ id: 1, imageUrl: 'https://example.com/s.png', objects: [] }])

    render(await ScenePage({ params: makeParams('1') }))
    expect(screen.getByText('Playing scene: Greetings')).toBeInTheDocument()
  })
})
