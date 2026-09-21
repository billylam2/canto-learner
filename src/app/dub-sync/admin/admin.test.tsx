import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

import { Admin } from './admin'
import { YoutubePlayer } from '@/components/dub-sync/youtube-player'

const episodeA = {
  id: 'ep-a',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-a',
  englishVideoId: 'eng-a',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}
const episodeB = {
  id: 'ep-b',
  title: 'The Playgroup',
  cantoneseVideoId: 'canto-b',
  englishVideoId: 'eng-b',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists episodes and switches the selected panel without navigating', () => {
    render(<Admin episodes={[episodeA, episodeB]} segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }} />)

    expect(screen.getByRole('heading', { name: 'Muddy Puddles' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'The Playgroup' }))

    expect(screen.getByRole('heading', { name: 'The Playgroup' })).toBeInTheDocument()
  })

  it('selects a newly created episode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeB, id: 'ep-c', title: 'New Episode' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Episode' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'c' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Episode' })).toBeInTheDocument())
  })

  it('marks the canto content start from the canto player and saves it', async () => {
    let capturedRef: React.Ref<unknown> | undefined
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
      if (elementId === 'canto-player') capturedRef = (props as { ref?: React.Ref<unknown> }).ref
      return <div data-testid={`player-${elementId}`} />
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 8 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    if (capturedRef && typeof capturedRef === 'object' && 'current' in capturedRef) {
      ;(capturedRef as { current: unknown }).current = {
        seekTo: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        getCurrentTime: () => 8,
      }
    }

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'PATCH' }))
    )
  })
})
