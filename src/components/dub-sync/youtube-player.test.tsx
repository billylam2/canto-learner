import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from './youtube-player'

vi.mock('@/lib/dub-sync/youtube-iframe-api', () => ({
  loadYoutubeIframeApi: vi.fn(),
}))

import { loadYoutubeIframeApi } from '@/lib/dub-sync/youtube-iframe-api'

function makeFakePlayer() {
  return {
    seekTo: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    getCurrentTime: vi.fn(() => 42),
  }
}

describe('YoutubePlayer', () => {
  it('creates a YT.Player for the given element and video, and marks itself ready', async () => {
    const fakePlayer = makeFakePlayer()
    const PlayerCtor = vi.fn(function PlayerCtor() { return fakePlayer })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })

    render(<YoutubePlayer videoId="video-1" elementId="canto-player" />)

    await waitFor(() => expect(PlayerCtor).toHaveBeenCalled())
    expect(PlayerCtor.mock.calls[0][0]).toBe('canto-player')
    expect(PlayerCtor.mock.calls[0][1]).toMatchObject({ videoId: 'video-1' })

    const onReady = PlayerCtor.mock.calls[0][1].events.onReady
    onReady()

    await waitFor(() =>
      expect(screen.getByTestId('youtube-player-canto-player')).toHaveAttribute('data-ready', 'true')
    )
  })

  it('exposes an imperative handle that delegates to the underlying player', async () => {
    const fakePlayer = makeFakePlayer()
    const PlayerCtor = vi.fn(function PlayerCtor() { return fakePlayer })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })

    const ref = createRef<YoutubePlayerHandle>()
    render(<YoutubePlayer ref={ref} videoId="video-1" elementId="canto-player" />)
    await waitFor(() => expect(PlayerCtor).toHaveBeenCalled())

    ref.current?.seekTo(10, true)
    ref.current?.playVideo()
    ref.current?.pauseVideo()
    expect(fakePlayer.seekTo).toHaveBeenCalledWith(10, true)
    expect(fakePlayer.playVideo).toHaveBeenCalled()
    expect(fakePlayer.pauseVideo).toHaveBeenCalled()
    expect(ref.current?.getCurrentTime()).toBe(42)
  })

  it('does not throw when imperative handle methods are called before the player is ready', async () => {
    // The real YT.Player object exists immediately after construction but its methods aren't
    // functional until onReady fires, so a not-yet-ready player lacks them entirely here.
    const notReadyPlayer = {}
    const PlayerCtor = vi.fn(function PlayerCtor() {
      return notReadyPlayer
    })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })

    const ref = createRef<YoutubePlayerHandle>()
    render(<YoutubePlayer ref={ref} videoId="video-1" elementId="canto-player" />)
    await waitFor(() => expect(PlayerCtor).toHaveBeenCalled())

    expect(() => ref.current?.seekTo(10, true)).not.toThrow()
    expect(() => ref.current?.playVideo()).not.toThrow()
    expect(() => ref.current?.pauseVideo()).not.toThrow()
    expect(ref.current?.getCurrentTime()).toBe(0)
  })

  it('calls the onError prop when the underlying player reports an error', async () => {
    const fakePlayer = makeFakePlayer()
    const PlayerCtor = vi.fn(function PlayerCtor() { return fakePlayer })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })
    const onError = vi.fn()

    render(<YoutubePlayer videoId="video-1" elementId="canto-player" onError={onError} />)
    await waitFor(() => expect(PlayerCtor).toHaveBeenCalled())

    PlayerCtor.mock.calls[0][1].events.onError()
    expect(onError).toHaveBeenCalled()
  })
})
