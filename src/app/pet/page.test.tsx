import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const getMock = vi.fn()
const getPublicUrlMock = vi.fn((path: string) => ({ data: { publicUrl: `https://example.com/${path}` } }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    storage: { from: () => ({ getPublicUrl: getPublicUrlMock }) },
  })),
}))
vi.mock('@/lib/db/progress', () => ({
  getProgressForKid: vi.fn(),
}))
vi.mock('@/lib/db/accessories', () => ({
  getAccessoriesForKid: vi.fn(),
}))

import PetPage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { getAccessoriesForKid } from '@/lib/db/accessories'
import { createSessionCookieValue } from '@/lib/auth/session'

describe('PetPage', () => {
  it('renders the guest pet page when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    render(await PetPage())
    expect(await screen.findByText('Fox')).toBeInTheDocument()
  })

  it("renders the shop with the signed-in kid's progress", async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])
    vi.mocked(getAccessoriesForKid).mockResolvedValue([])

    render(await PetPage())

    expect(screen.getByText('★ 24 stars to spend')).toBeInTheDocument()
  })
})
