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
  listEpisodes: vi.fn(),
}))

import DubSyncPage from './page'
import { listEpisodes } from '@/lib/db/dub-sync'

describe('DubSyncPage', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('redirects to the first episode when episodes exist', async () => {
    vi.mocked(listEpisodes).mockResolvedValue([
      { id: 'ep-a', title: 'A', cantoneseVideoId: 'c1', englishVideoId: 'e1', cantoContentStart: null, cantoContentEnd: null, englishContentStart: null, englishContentEnd: null },
      { id: 'ep-b', title: 'B', cantoneseVideoId: 'c2', englishVideoId: 'e2', cantoContentStart: null, cantoContentEnd: null, englishContentStart: null, englishContentEnd: null },
    ])

    await expect(DubSyncPage()).rejects.toThrow('REDIRECT:/dub-sync/ep-a')
    expect(redirectMock).toHaveBeenCalledWith('/dub-sync/ep-a')
  })

  it('shows an empty message instead of redirecting when there are no episodes', async () => {
    vi.mocked(listEpisodes).mockResolvedValue([])

    render(await DubSyncPage())

    expect(redirectMock).not.toHaveBeenCalled()
    expect(screen.getByText('No episodes yet.')).toBeInTheDocument()
  })
})
