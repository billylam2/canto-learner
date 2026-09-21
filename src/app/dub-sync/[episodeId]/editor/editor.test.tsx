import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

import { Editor } from './editor'
import { YoutubePlayer } from '@/components/dub-sync/youtube-player'

const baseEpisode = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

function mockPlayerHandle(currentTime: number) {
  return { seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getCurrentTime: () => currentTime }
}

describe('Editor anchors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('marks the canto content start from the canto player current time and saves it', async () => {
    let capturedRef: React.Ref<unknown> | undefined
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
      if (elementId === 'canto-player') capturedRef = (props as { ref?: React.Ref<unknown> }).ref
      return <div data-testid={`player-${elementId}`} />
    })

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...baseEpisode, cantoContentStart: 8 } }),
    } as Response)

    render(<Editor episode={baseEpisode} segments={[]} />)

    if (capturedRef && typeof capturedRef === 'object' && 'current' in capturedRef) {
      ;(capturedRef as { current: unknown }).current = mockPlayerHandle(8)
    }

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-1', expect.objectContaining({ method: 'PATCH' }))
    )
  })

  it('disables segment controls until all four anchors are set', () => {
    render(<Editor episode={baseEpisode} segments={[]} />)
    expect(screen.getByRole('button', { name: 'Mark start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate from captions' })).toBeDisabled()
  })

  it('enables segment controls once all four anchors are set', () => {
    render(
      <Editor
        episode={{
          ...baseEpisode,
          cantoContentStart: 8,
          cantoContentEnd: 100,
          englishContentStart: 5,
          englishContentEnd: 95,
        }}
        segments={[]}
      />
    )
    expect(screen.getByRole('button', { name: 'Mark start' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Generate from captions' })).toBeEnabled()
  })
})
