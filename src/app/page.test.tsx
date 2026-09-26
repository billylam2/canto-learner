import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url)
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/dub-sync', () => ({
  listPublishedEpisodes: vi.fn(),
}))

import HomePage from './page'
import { listPublishedEpisodes } from '@/lib/db/dub-sync'

describe('HomePage', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('redirects to the first published episode when published episodes exist', async () => {
    vi.mocked(listPublishedEpisodes).mockResolvedValue([
      { id: 'ep-a', title: 'A', cantoneseVideoId: 'c1', englishVideoId: 'e1', cantoContentStart: null, cantoContentEnd: null, englishContentStart: null, englishContentEnd: null, published: true },
      { id: 'ep-b', title: 'B', cantoneseVideoId: 'c2', englishVideoId: 'e2', cantoContentStart: null, cantoContentEnd: null, englishContentStart: null, englishContentEnd: null, published: true },
    ])

    await expect(HomePage()).rejects.toThrow('REDIRECT:/dub-sync/ep-a')
    expect(redirectMock).toHaveBeenCalledWith('/dub-sync/ep-a')
  })

  it('shows an empty message instead of redirecting when there are no published episodes', async () => {
    vi.mocked(listPublishedEpisodes).mockResolvedValue([])

    render(await HomePage())

    expect(redirectMock).not.toHaveBeenCalled()
    expect(screen.getByText('No episodes yet.')).toBeInTheDocument()
  })
})
