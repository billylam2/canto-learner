import { describe, it, expect, vi } from 'vitest'

const redirectMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: vi.fn() }),
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

import PetPage from './page'

describe('PetPage', () => {
  it('redirects to /play while the reward system is disabled', async () => {
    await expect(PetPage()).rejects.toThrow('REDIRECT:/play')
    expect(redirectMock).toHaveBeenCalledWith('/play')
  })
})
