import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

vi.mock('@/lib/dub-sync/player-controller', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dub-sync/player-controller')>(
    '@/lib/dub-sync/player-controller'
  )
  return {
    ...actual,
    SegmentPlaybackController: vi.fn().mockImplementation(function SegmentPlaybackController() {
      return { playSegment: vi.fn(), playBoth: vi.fn(), stop: vi.fn() }
    }),
  }
})

import { Player } from './player'
import { SegmentPlaybackController } from '@/lib/dub-sync/player-controller'
import { YoutubePlayer } from '@/components/dub-sync/youtube-player'

const episode = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

const segments = [
  {
    id: 'seg-1',
    episodeId: 'ep-1',
    position: 0,
    label: 'Hello',
    cantoStart: 12,
    cantoEnd: 15,
    englishStart: 22,
    englishEnd: 26,
  },
]

describe('Player', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the segment list and plays a segment on click', () => {
    render(<Player episode={episode} segments={segments} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    const controllerInstance = vi.mocked(SegmentPlaybackController).mock.results[0].value
    expect(controllerInstance.playSegment).toHaveBeenCalledWith('canto', { start: 12, end: 15 })
  })

  it('plays both languages back to back via "Play both"', () => {
    render(<Player episode={episode} segments={segments} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play both' }))
    const controllerInstance = vi.mocked(SegmentPlaybackController).mock.results[0].value
    expect(controllerInstance.playBoth).toHaveBeenCalledWith({ start: 12, end: 15 }, { start: 22, end: 26 })
  })

  it('switches the active language and re-plays the current segment', () => {
    render(<Player episode={episode} segments={segments} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
    const controllerInstance = vi.mocked(SegmentPlaybackController).mock.results[0].value
    expect(controllerInstance.playSegment).toHaveBeenCalledWith('english', { start: 22, end: 26 })
  })

  it('shows an inline message when a player reports an error', () => {
    render(<Player episode={episode} segments={segments} />)
    const cantoPlayerCall = vi.mocked(YoutubePlayer).mock.calls.find((call) => call[0].elementId === 'canto-player')
    act(() => {
      cantoPlayerCall?.[0].onError?.()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('This video is unavailable.')
  })
})
