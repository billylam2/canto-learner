import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { createRef, useState } from 'react'
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
    setPlaybackRate: vi.fn(),
    mute: vi.fn(),
    unMute: vi.fn(),
    destroy: vi.fn(),
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
    expect(PlayerCtor.mock.calls[0][1]).toMatchObject({
      videoId: 'video-1',
      width: 960,
      height: 540,
      // YouTube's own fullscreen button fullscreens only its own iframe, which breaks the
      // Cantonese/English swap technique (see youtube-iframe-api.ts) — disabled in favor of the
      // player page's own fullscreen control.
      playerVars: { fs: 0 },
    })

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
    ref.current?.setPlaybackRate?.(1.25)
    ref.current?.mute?.()
    ref.current?.unMute?.()
    expect(fakePlayer.seekTo).toHaveBeenCalledWith(10, true)
    expect(fakePlayer.playVideo).toHaveBeenCalled()
    expect(fakePlayer.pauseVideo).toHaveBeenCalled()
    expect(fakePlayer.setPlaybackRate).toHaveBeenCalledWith(1.25)
    expect(fakePlayer.mute).toHaveBeenCalled()
    expect(fakePlayer.unMute).toHaveBeenCalled()
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
    expect(() => ref.current?.mute?.()).not.toThrow()
    expect(() => ref.current?.unMute?.()).not.toThrow()
    expect(ref.current?.getCurrentTime()).toBe(0)
  })

  it('calls the onEnded prop when the underlying player reports the ENDED state', async () => {
    const fakePlayer = makeFakePlayer()
    const PlayerCtor = vi.fn(function PlayerCtor() { return fakePlayer })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })
    const onEnded = vi.fn()

    render(<YoutubePlayer videoId="video-1" elementId="canto-player" onEnded={onEnded} />)
    await waitFor(() => expect(PlayerCtor).toHaveBeenCalled())

    PlayerCtor.mock.calls[0][1].events.onStateChange({ data: 0 })
    expect(onEnded).toHaveBeenCalled()
  })

  it('does not call onEnded for other player states', async () => {
    const fakePlayer = makeFakePlayer()
    const PlayerCtor = vi.fn(function PlayerCtor() { return fakePlayer })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })
    const onEnded = vi.fn()

    render(<YoutubePlayer videoId="video-1" elementId="canto-player" onEnded={onEnded} />)
    await waitFor(() => expect(PlayerCtor).toHaveBeenCalled())

    PlayerCtor.mock.calls[0][1].events.onStateChange({ data: 1 }) // playing
    expect(onEnded).not.toHaveBeenCalled()
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

  it('does not recreate the underlying player when only the onError prop identity changes', async () => {
    // A caller that passes a fresh inline arrow function as onError on every render (a common
    // pattern) must not cause the real YT.Player to be torn down and reconstructed — that would
    // reset playback (seek position, play state) on every unrelated re-render of the parent.
    const fakePlayer = makeFakePlayer()
    const PlayerCtor = vi.fn(function PlayerCtor() {
      return fakePlayer
    })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })

    function Wrapper() {
      const [, forceRerender] = useState(0)
      return (
        <>
          <YoutubePlayer videoId="video-1" elementId="canto-player" onError={() => {}} />
          <button onClick={() => forceRerender((n) => n + 1)}>rerender</button>
        </>
      )
    }

    render(<Wrapper />)
    await waitFor(() => expect(PlayerCtor).toHaveBeenCalledTimes(1))

    await act(async () => {
      screen.getByRole('button', { name: 'rerender' }).click()
      await Promise.resolve()
    })
    await act(async () => {
      screen.getByRole('button', { name: 'rerender' }).click()
      await Promise.resolve()
    })

    expect(PlayerCtor).toHaveBeenCalledTimes(1)
  })

  it('destroys the underlying player on unmount', async () => {
    // React (in dev StrictMode) mounts, unmounts, and remounts effects once to surface cleanup
    // bugs. Without calling the YouTube API's own destroy() here, the first mount's iframe is
    // never torn down before the second mount targets the same element id, leaving a dangling
    // node that later fails a React removeChild call.
    const fakePlayer = makeFakePlayer()
    const PlayerCtor = vi.fn(function PlayerCtor() {
      return fakePlayer
    })
    vi.mocked(loadYoutubeIframeApi).mockResolvedValue({ Player: PlayerCtor as never })

    const { unmount } = render(<YoutubePlayer videoId="video-1" elementId="canto-player" />)
    await waitFor(() => expect(PlayerCtor).toHaveBeenCalledTimes(1))

    unmount()

    expect(fakePlayer.destroy).toHaveBeenCalled()
  })
})
