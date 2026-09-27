import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const notFoundMock = vi.fn()

vi.mock('next/navigation', () => ({
  notFound: () => {
    notFoundMock()
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  listPublishedEpisodes: vi.fn(),
  listSegments: vi.fn(),
}))
vi.mock('./player', () => ({
  Player: ({ episode }: { episode: { title: string } }) => <div>Playing {episode.title}</div>,
}))

import DubSyncEpisodePage from './page'
import { getEpisode, listPublishedEpisodes, listSegments } from '@/lib/db/dub-sync'

const publishedEpisode = {
  id: 'ep-a',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-a',
  englishVideoId: 'eng-a',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
  published: true,
  position: 0,
}

function makeParams(episodeId: string) {
  return Promise.resolve({ episodeId })
}

describe('DubSyncEpisodePage', () => {
  beforeEach(() => {
    notFoundMock.mockClear()
    vi.mocked(listSegments).mockResolvedValue([])
    vi.mocked(listPublishedEpisodes).mockResolvedValue([publishedEpisode])
  })

  it('calls notFound for an unknown episode id', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)

    await expect(DubSyncEpisodePage({ params: makeParams('missing') })).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('calls notFound for an episode that exists but is not published, even by direct URL', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...publishedEpisode, published: false })

    await expect(DubSyncEpisodePage({ params: makeParams('ep-a') })).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('renders the player for a published episode', async () => {
    vi.mocked(getEpisode).mockResolvedValue(publishedEpisode)

    render(await DubSyncEpisodePage({ params: makeParams('ep-a') }))

    expect(screen.getByText('Playing Muddy Puddles')).toBeInTheDocument()
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})
