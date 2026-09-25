import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

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
        playEpisodeAlternating: vi.fn(),
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

const episodes = [episode]

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
    render(<Player episode={episode} segments={segments} episodes={episodes} />)
    expect(screen.getByTestId('canto-video-wrapper')).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByTestId('canto-video-wrapper')).toHaveClass('opacity-100')
    expect(screen.getByTestId('english-video-wrapper')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('english-video-wrapper')).toHaveClass('opacity-0')
  })

  it('shows an inline message when a player reports an error', () => {
    render(<Player episode={episode} segments={segments} episodes={episodes} />)
    const cantoPlayerCall = vi.mocked(YoutubePlayer).mock.calls.find((call) => call[0].elementId === 'canto-player')
    act(() => {
      cantoPlayerCall?.[0].onError?.()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('This video is unavailable.')
  })

  describe('Replay in English', () => {
    it('pauses the Cantonese video and plays the English audio for the current line', () => {
      const cantoHandle = mockCantoPlayerHandle(12) // 50% through seg-1 (10-14)

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
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

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
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

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      expect(screen.getByTestId('canto-video-wrapper')).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByTestId('english-video-wrapper')).toHaveAttribute('aria-hidden', 'false')

      act(() => capturedOnDone?.())

      expect(screen.getByTestId('canto-video-wrapper')).toHaveAttribute('aria-hidden', 'false')
      expect(screen.getByTestId('english-video-wrapper')).toHaveAttribute('aria-hidden', 'true')
      expect(cantoHandle.playVideo).toHaveBeenCalled()
    })

    it('picks the previous line when the current one has barely started', () => {
      mockCantoPlayerHandle(41) // 25% through seg-2 (40-44); seg-1 already finished

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      expect(getController().playSegment).toHaveBeenCalledWith(
        'english',
        { start: 22, end: 26 },
        expect.any(Function)
      )
    })

    it('shows a message instead of playing anything when no line has started yet', () => {
      const cantoHandle = mockCantoPlayerHandle(1)

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Replay in English' }))

      // Nothing to replay, so playback is left alone rather than being paused for no reason.
      expect(cantoHandle.pauseVideo).not.toHaveBeenCalled()
      expect(getController().playSegment).not.toHaveBeenCalled()
      expect(screen.getByText('No line to replay yet.')).toBeInTheDocument()
    })
  })

  describe('Play alternating', () => {
    it('starts alternating playback from the current position and toggles to Stop alternating', () => {
      mockCantoPlayerHandle(7)

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play alternating' }))

      expect(getController().playEpisodeAlternating).toHaveBeenCalledWith(segments, 7)
      expect(screen.getByRole('button', { name: 'Stop alternating' })).toBeInTheDocument()
    })

    it('stops the controller and toggles back when clicked again', () => {
      mockCantoPlayerHandle(7)

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play alternating' }))
      fireEvent.click(screen.getByRole('button', { name: 'Stop alternating' }))

      expect(getController().stop).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Play alternating' })).toBeInTheDocument()
    })

    it('disables Replay in English while alternating playback is running', () => {
      mockCantoPlayerHandle(7)

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Play alternating' }))

      expect(screen.getByRole('button', { name: 'Replay in English' })).toBeDisabled()
    })
  })

  describe('Fullscreen', () => {
    const originalRequestFullscreen = Element.prototype.requestFullscreen
    const originalExitFullscreen = document.exitFullscreen

    beforeEach(() => {
      Element.prototype.requestFullscreen = vi.fn(function (this: HTMLElement) {
        Object.defineProperty(document, 'fullscreenElement', { value: this, configurable: true })
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      })
      document.exitFullscreen = vi.fn(() => {
        Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      })
    })

    afterEach(() => {
      Element.prototype.requestFullscreen = originalRequestFullscreen
      document.exitFullscreen = originalExitFullscreen
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    })

    // The browser's own fullscreen exit (Esc key) doesn't go through our code — it just changes
    // document.fullscreenElement and fires 'fullscreenchange', which is what this simulates.
    function simulateBrowserExitFullscreen() {
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
      document.dispatchEvent(new Event('fullscreenchange'))
    }

    it('requests fullscreen on the shared video+controls container and hides all controls', async () => {
      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))

      expect(Element.prototype.requestFullscreen).toHaveBeenCalled()
      // No controls overlay the video in fullscreen (they'd otherwise sit on top of captions).
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument())
      expect(screen.queryByRole('button', { name: 'Replay in English' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Play alternating' })).not.toBeInTheDocument()
    })

    it('restores the controls once the browser exits fullscreen', async () => {
      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument())

      simulateBrowserExitFullscreen()

      await waitFor(() => expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Replay in English' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Play alternating' })).toBeInTheDocument()
    })

    it('falls back to a CSS-only fullscreen with its own exit control when requestFullscreen is unsupported (e.g. iOS Safari)', async () => {
      // @ts-expect-error -- deliberately removing the method to simulate an unsupported browser
      delete Element.prototype.requestFullscreen

      render(<Player episode={episode} segments={segments} episodes={episodes} />)
      fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))

      // The video still goes full-viewport (no native confirmation needed for that), but since
      // there's no browser-level Esc-to-exit, our own exit control has to appear instead.
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }))

      await waitFor(() => expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument())
    })
  })

  describe('Playlist sidebar and auto-advance', () => {
    const nextEpisode = { ...episode, id: 'ep-2', title: 'Mr. Dinosaur Is Lost' }

    function fireCantoEnded() {
      const cantoPlayerCall = vi.mocked(YoutubePlayer).mock.calls.find((call) => call[0].elementId === 'canto-player')
      act(() => cantoPlayerCall?.[0].onEnded?.())
    }

    it('lists every episode in the sidebar, linking to its player page', () => {
      render(<Player episode={episode} segments={segments} episodes={[episode, nextEpisode]} />)

      expect(screen.getByRole('link', { name: /Mr\. Dinosaur Is Lost/ })).toHaveAttribute('href', '/dub-sync/ep-2')
    })

    it('navigates to the next episode once the Cantonese video ends', () => {
      render(<Player episode={episode} segments={segments} episodes={[episode, nextEpisode]} />)

      fireCantoEnded()

      expect(pushMock).toHaveBeenCalledWith('/dub-sync/ep-2')
    })

    it('does nothing when the current episode is the last one in the playlist', () => {
      render(<Player episode={episode} segments={segments} episodes={[episode]} />)

      fireCantoEnded()

      expect(pushMock).not.toHaveBeenCalled()
    })
  })
})
