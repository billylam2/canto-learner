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
    cantoStart: 10,
    cantoEnd: 14,
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

function mockCantoPlayerHandle(currentTime: number) {
  const handle = { seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getCurrentTime: () => currentTime }
  vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
    const ref = (props as { ref?: React.Ref<unknown> }).ref
    if (elementId === 'canto-player' && ref && typeof ref === 'object' && 'current' in ref) {
      ;(ref as { current: unknown }).current = handle
    }
    return <div data-testid={`player-${elementId}`} />
  })
  return handle
}

describe('Player', () => {
  beforeEach(() => vi.clearAllMocks())

  it('initially shows the Cantonese video with the English video visually hidden', () => {
    render(<Player episode={episode} segments={segments} />)
    expect(screen.getByTestId('canto-video-wrapper')).not.toHaveClass('sr-only')
    expect(screen.getByTestId('english-video-wrapper')).toHaveClass('sr-only')
  })

  it('shows an inline message when a player reports an error', () => {
    render(<Player episode={episode} segments={segments} />)
    const cantoPlayerCall = vi.mocked(YoutubePlayer).mock.calls.find((call) => call[0].elementId === 'canto-player')
    act(() => {
      cantoPlayerCall?.[0].onError?.()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('This video is unavailable.')
  })

  describe('Replay in English', () => {
    it('pauses the Cantonese video and plays the English audio for the current line', () => {
      const cantoHandle = mockCantoPlayerHandle(12) // 50% through seg-1 (10-14)

      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      expect(cantoHandle.pauseVideo).toHaveBeenCalled()
      expect(getController().playSegment).toHaveBeenCalledWith(
        'english',
        { start: 22, end: 26 },
        expect.any(Function)
      )
    })

    it('resumes the Cantonese video once the English audio finishes', () => {
      const cantoHandle = mockCantoPlayerHandle(12)

      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      // The mocked controller invokes the onDone callback synchronously.
      expect(cantoHandle.playVideo).toHaveBeenCalled()
    })

    it('shows the English video (and hides Cantonese) while its audio plays, swapping back when it finishes', () => {
      const cantoHandle = mockCantoPlayerHandle(12)
      let capturedOnDone: (() => void) | undefined
      vi.mocked(SegmentPlaybackController).mockImplementationOnce(function SegmentPlaybackControllerMock(
        _getPlayer: unknown,
        onLanguageChange: (lang: string) => void
      ) {
        return {
          playSegment: vi.fn((lang: string, _segment: unknown, onDone?: () => void) => {
            onLanguageChange(lang)
            capturedOnDone = onDone
          }),
          playBoth: vi.fn(),
          stop: vi.fn(),
        } as never
      })

      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      expect(screen.getByTestId('canto-video-wrapper')).toHaveClass('sr-only')
      expect(screen.getByTestId('english-video-wrapper')).not.toHaveClass('sr-only')

      act(() => capturedOnDone?.())

      expect(screen.getByTestId('canto-video-wrapper')).not.toHaveClass('sr-only')
      expect(screen.getByTestId('english-video-wrapper')).toHaveClass('sr-only')
      expect(cantoHandle.playVideo).toHaveBeenCalled()
    })

    it('picks the previous line when the current one has barely started', () => {
      mockCantoPlayerHandle(41) // 25% through seg-2 (40-44); seg-1 already finished

      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      expect(getController().playSegment).toHaveBeenCalledWith(
        'english',
        { start: 22, end: 26 },
        expect.any(Function)
      )
    })

    it('shows a message instead of playing anything when no line has started yet', () => {
      const cantoHandle = mockCantoPlayerHandle(1)

      render(<Player episode={episode} segments={segments} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      // Nothing to replay, so playback is left alone rather than being paused for no reason.
      expect(cantoHandle.pauseVideo).not.toHaveBeenCalled()
      expect(getController().playSegment).not.toHaveBeenCalled()
      expect(screen.getByText('No line to replay yet.')).toBeInTheDocument()
    })
  })
})
