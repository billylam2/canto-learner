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
      return {
        playSegment: vi.fn((_lang: string, _segment: unknown, onDone?: () => void) => {
          onDone?.()
        }),
        playBoth: vi.fn(),
        stop: vi.fn(),
      }
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
  {
    id: 'seg-2',
    episodeId: 'ep-1',
    position: 1,
    label: 'George cries',
    cantoStart: 40,
    cantoEnd: 44,
    englishStart: 38,
    englishEnd: 41,
  },
]

function getController() {
  return vi.mocked(SegmentPlaybackController).mock.results[0].value
}

describe('Player', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the Cantonese video is always visible and the English video is always visually hidden', () => {
    render(<Player episode={episode} segments={segments} />)
    expect(screen.getByTestId('canto-video-wrapper')).not.toHaveClass('sr-only')
    expect(screen.getByTestId('english-video-wrapper')).toHaveClass('sr-only')
  })

  it('plays a segment\'s Cantonese line on "Play"', () => {
    render(<Player episode={episode} segments={segments} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0])
    expect(getController().playSegment).toHaveBeenCalledWith('canto', { start: 12, end: 15 })
  })

  it('plays a segment\'s English audio on "Play English"', () => {
    render(<Player episode={episode} segments={segments} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Play English' })[0])
    expect(getController().playSegment).toHaveBeenCalledWith('english', { start: 22, end: 26 })
  })

  it('plays both languages back to back via "Play both"', () => {
    render(<Player episode={episode} segments={segments} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Play both' })[0])
    expect(getController().playBoth).toHaveBeenCalledWith({ start: 12, end: 15 }, { start: 22, end: 26 })
  })

  it('shows an inline message when a player reports an error', () => {
    render(<Player episode={episode} segments={segments} />)
    const cantoPlayerCall = vi.mocked(YoutubePlayer).mock.calls.find((call) => call[0].elementId === 'canto-player')
    act(() => {
      cantoPlayerCall?.[0].onError?.()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('This video is unavailable.')
  })

  describe('Play episode mode', () => {
    it("starts by playing the first segment's Cantonese line, then shows the waiting controls", () => {
      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))
      expect(getController().playSegment).toHaveBeenCalledWith('canto', { start: 12, end: 15 }, expect.any(Function))
      expect(screen.getByRole('button', { name: 'Replay Cantonese' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show English' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next line' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Stop episode' })).toBeInTheDocument()
    })

    it('plays the current segment\'s English audio on "Show English"', () => {
      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))
      vi.mocked(getController().playSegment).mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Show English' }))
      expect(getController().playSegment).toHaveBeenCalledWith('english', { start: 22, end: 26 }, expect.any(Function))
    })

    it('replays the current segment\'s Cantonese line on "Replay Cantonese"', () => {
      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))
      vi.mocked(getController().playSegment).mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Replay Cantonese' }))
      expect(getController().playSegment).toHaveBeenCalledWith('canto', { start: 12, end: 15 }, expect.any(Function))
    })

    it('advances to the next segment\'s Cantonese line on "Next line"', () => {
      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))
      vi.mocked(getController().playSegment).mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Next line' }))
      expect(getController().playSegment).toHaveBeenCalledWith('canto', { start: 40, end: 44 }, expect.any(Function))
    })

    it('shows a completion message after "Next line" on the last segment', () => {
      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))
      fireEvent.click(screen.getByRole('button', { name: 'Next line' }))
      fireEvent.click(screen.getByRole('button', { name: 'Next line' }))
      expect(screen.getByText('Episode complete!')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next line' })).not.toBeInTheDocument()
    })

    it('stops episode mode and returns to the segment list on "Stop episode"', () => {
      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))
      fireEvent.click(screen.getByRole('button', { name: 'Stop episode' }))
      expect(getController().stop).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Play episode' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Stop episode' })).not.toBeInTheDocument()
    })
  })
})
