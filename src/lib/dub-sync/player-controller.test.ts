import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SegmentPlaybackController, type YouTubePlayerLike, type DubLanguage } from './player-controller'

// Generates currentTime checkpoints stepping from `from` to `to` in increments no larger than
// the controller's seek-jump threshold, so simulated continuous playback in tests doesn't trip
// the "did the user manually seek" guard the way a real jump-sized gap between checkpoints would.
function ramp(from: number, to: number, step = 1): number[] {
  const values: number[] = []
  for (let v = from; v < to; v += step) values.push(v)
  values.push(to)
  return values
}

function makePlayer(currentTimeSequence: number[]): YouTubePlayerLike {
  let index = 0
  return {
    seekTo: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    getCurrentTime: vi.fn(() => {
      const value = currentTimeSequence[Math.min(index, currentTimeSequence.length - 1)]
      index += 1
      return value
    }),
    mute: vi.fn(),
    unMute: vi.fn(),
    setVolume: vi.fn(),
  }
}

describe('SegmentPlaybackController', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('seeks and plays immediately when a segment starts', () => {
    const cantoPlayer = makePlayer([10])
    const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)
    controller.playSegment('canto', { start: 10, end: 14 })
    expect(cantoPlayer.seekTo).toHaveBeenCalledWith(10, true)
    expect(cantoPlayer.playVideo).toHaveBeenCalled()
  })

  it('pauses once playback passes the segment end', async () => {
    const cantoPlayer = makePlayer([10, 11, 12, 15])
    const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)
    controller.playSegment('canto', { start: 10, end: 14 })
    // 400ms to detect the end via polling, plus the fade-out (FADE_DURATION_MS) before pausing.
    await vi.advanceTimersByTimeAsync(700)
    expect(cantoPlayer.pauseVideo).toHaveBeenCalled()
  })

  it('fades the volume down to 0 before pausing', async () => {
    const cantoPlayer = makePlayer([10, 15])
    const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)
    controller.playSegment('canto', { start: 10, end: 14 })
    await vi.advanceTimersByTimeAsync(500)

    const setVolumeCalls = vi.mocked(cantoPlayer.setVolume!).mock
    const pauseCallOrder = vi.mocked(cantoPlayer.pauseVideo).mock.invocationCallOrder[0]
    // The last setVolume call before pausing (ignoring the earlier fade-in-to-100 calls from
    // starting this same segment) must have set it all the way down to 0, and must have
    // happened strictly before pauseVideo — not after.
    const callsBeforePause = setVolumeCalls.invocationCallOrder
      .map((order, i) => ({ order, volume: setVolumeCalls.calls[i][0] }))
      .filter(({ order }) => order < pauseCallOrder)
    expect(callsBeforePause.at(-1)?.volume).toBe(0)
  })

  it('calls onDone once when the segment ends', async () => {
    const cantoPlayer = makePlayer([10, 15])
    const onDone = vi.fn()
    const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)
    controller.playSegment('canto', { start: 10, end: 14 }, onDone)
    // 200ms to detect the end via polling, plus the fade-out before onDone fires.
    await vi.advanceTimersByTimeAsync(500)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('playBoth plays canto then chains to english once the canto segment ends', async () => {
    const cantoPlayer = makePlayer([10, 14, 15])
    const englishPlayer = makePlayer([8, 9])
    const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
    const onLanguageChange = vi.fn()
    const controller = new SegmentPlaybackController(getPlayer, onLanguageChange, 100)

    controller.playBoth({ start: 10, end: 14 }, { start: 8, end: 12 })
    expect(onLanguageChange).toHaveBeenCalledWith('canto')

    await vi.advanceTimersByTimeAsync(500)

    expect(cantoPlayer.pauseVideo).toHaveBeenCalled()
    expect(onLanguageChange).toHaveBeenCalledWith('english')
    expect(englishPlayer.seekTo).toHaveBeenCalledWith(8, true)
    expect(englishPlayer.playVideo).toHaveBeenCalled()
  })

  it('stop clears any in-flight polling', () => {
    const cantoPlayer = makePlayer([10, 11, 12, 13, 14, 15])
    const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)
    controller.playSegment('canto', { start: 10, end: 14 })
    controller.stop()
    vi.advanceTimersByTime(1000)
    expect(cantoPlayer.pauseVideo).not.toHaveBeenCalled()
  })

  describe('playWithFade / pauseWithFade', () => {
    // These are exported directly (not just used internally by playSegment/watchForSegmentEnd)
    // for callers like "replay in English" that pause/resume a player outside of a tracked
    // segment.

    it('playWithFade starts silent, seeks and plays immediately, then ramps the volume up to 100', async () => {
      const player = makePlayer([0])
      const controller = new SegmentPlaybackController(() => player, vi.fn(), 100)

      controller.playWithFade(player, 10)

      expect(player.setVolume).toHaveBeenCalledWith(0)
      expect(player.seekTo).toHaveBeenCalledWith(10, true)
      expect(player.playVideo).toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)
      expect(player.setVolume).toHaveBeenLastCalledWith(100)
    })

    it('playWithFade plays from the current position when no seek target is given', () => {
      const player = makePlayer([0])
      const controller = new SegmentPlaybackController(() => player, vi.fn(), 100)

      controller.playWithFade(player)

      expect(player.seekTo).not.toHaveBeenCalled()
      expect(player.playVideo).toHaveBeenCalled()
    })

    it('pauseWithFade ramps the volume down to 0, then pauses, resolving only once both are done', async () => {
      const player = makePlayer([0])
      const controller = new SegmentPlaybackController(() => player, vi.fn(), 100)

      const done = vi.fn()
      controller.pauseWithFade(player).then(done)
      expect(player.pauseVideo).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)

      expect(player.setVolume).toHaveBeenLastCalledWith(0)
      expect(player.pauseVideo).toHaveBeenCalled()
      expect(done).toHaveBeenCalled()
    })

    it('resolves immediately without erroring when the player has no setVolume support', async () => {
      const player: YouTubePlayerLike = {
        seekTo: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        getCurrentTime: vi.fn(() => 0),
      }
      const controller = new SegmentPlaybackController(() => player, vi.fn(), 100)

      await controller.pauseWithFade(player)

      expect(player.pauseVideo).toHaveBeenCalled()
    })
  })

  describe('playEpisodeAlternating', () => {
    it('starts canto playback from the given start time', () => {
      const cantoPlayer = makePlayer([5])
      const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)

      controller.playEpisodeAlternating([{ cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 }], 5)

      expect(cantoPlayer.seekTo).toHaveBeenCalledWith(5, true)
      expect(cantoPlayer.playVideo).toHaveBeenCalled()
    })

    it('primes the english player (muted play+pause) so mobile browsers allow it to autoplay later', () => {
      // Mobile Safari only allows a video element's first-ever play() to succeed when it's
      // called synchronously within a user gesture (this call). Without priming it here, the
      // English player's first real play() — triggered later from watchForSegmentEnd's async
      // interval, not a gesture — gets silently blocked on those browsers.
      const cantoPlayer = makePlayer([5])
      const englishPlayer = makePlayer([0])
      const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
      const controller = new SegmentPlaybackController(getPlayer, vi.fn(), 100)

      controller.playEpisodeAlternating([{ cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 }], 5)

      expect(englishPlayer.mute).toHaveBeenCalled()
      expect(englishPlayer.playVideo).toHaveBeenCalled()
      expect(englishPlayer.pauseVideo).toHaveBeenCalled()
      expect(englishPlayer.unMute).toHaveBeenCalled()
    })

    it('plays the english segment once canto reaches its end, then resumes canto at cantoEnd', async () => {
      const cantoPlayer = makePlayer([12, 13, 14, 15])
      const englishPlayer = makePlayer([22, 26])
      const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
      const onLanguageChange = vi.fn()
      const controller = new SegmentPlaybackController(getPlayer, onLanguageChange, 100)

      controller.playEpisodeAlternating([{ cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 }], 12)
      await vi.advanceTimersByTimeAsync(500)

      expect(cantoPlayer.pauseVideo).toHaveBeenCalled()
      expect(onLanguageChange).toHaveBeenCalledWith('english')
      expect(englishPlayer.seekTo).toHaveBeenCalledWith(22, true)

      // Detecting the english segment's own end, plus both fade-outs/fade-ins along the way.
      await vi.advanceTimersByTimeAsync(500)

      expect(onLanguageChange).toHaveBeenCalledWith('canto')
      expect(cantoPlayer.seekTo).toHaveBeenCalledWith(14, true)
    })

    it('skips segments that already ended before the start time', async () => {
      const cantoPlayer = makePlayer([41, 42, 43, 44])
      const englishPlayer = makePlayer([38])
      const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
      const controller = new SegmentPlaybackController(getPlayer, vi.fn(), 100)

      controller.playEpisodeAlternating(
        [
          { cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 },
          { cantoStart: 40, cantoEnd: 44, englishStart: 38, englishEnd: 41 },
        ],
        41
      )
      await vi.advanceTimersByTimeAsync(600)

      expect(englishPlayer.seekTo).toHaveBeenCalledWith(38, true)
      expect(englishPlayer.seekTo).not.toHaveBeenCalledWith(22, true)
    })

    it('chains through multiple segments in order', async () => {
      const cantoPlayer = makePlayer([...ramp(5, 14), ...ramp(14, 44)])
      const englishPlayer = makePlayer([22, 26, 38, 41])
      const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
      const controller = new SegmentPlaybackController(getPlayer, vi.fn(), 100)

      controller.playEpisodeAlternating(
        [
          { cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 },
          { cantoStart: 40, cantoEnd: 44, englishStart: 38, englishEnd: 41 },
        ],
        5
      )
      await vi.advanceTimersByTimeAsync(8000)

      expect(englishPlayer.seekTo).toHaveBeenCalledWith(22, true)
      expect(englishPlayer.seekTo).toHaveBeenCalledWith(38, true)
    })

    it('does not treat a manual forward seek past a boundary as the segment finishing', () => {
      // Canto plays naturally up to 12, then the user seeks straight to 30 — jumping past
      // segment 1's cantoEnd (14) and landing inside the gap before segment 2 (cantoStart 40).
      // This must not trigger "segment 1 finished" (which would pause canto, play English
      // audio, then seek back to 14).
      const cantoPlayer = makePlayer([...ramp(5, 12), 30, 31])
      const englishPlayer = makePlayer([22])
      const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
      const controller = new SegmentPlaybackController(getPlayer, vi.fn(), 100)

      controller.playEpisodeAlternating(
        [
          { cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 },
          { cantoStart: 40, cantoEnd: 44, englishStart: 38, englishEnd: 41 },
        ],
        5
      )
      vi.advanceTimersByTime(1200)

      expect(englishPlayer.seekTo).not.toHaveBeenCalled()
      expect(cantoPlayer.pauseVideo).not.toHaveBeenCalled()
      expect(cantoPlayer.seekTo).not.toHaveBeenCalledWith(14, true)
    })

    it('resumes watching the right segment after a manual seek lands inside it', async () => {
      // Seek jumps straight into the middle of segment 2, past segment 1 entirely.
      const cantoPlayer = makePlayer([5, 41, 44, 45])
      const englishPlayer = makePlayer([38])
      const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
      const controller = new SegmentPlaybackController(getPlayer, vi.fn(), 100)

      controller.playEpisodeAlternating(
        [
          { cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 },
          { cantoStart: 40, cantoEnd: 44, englishStart: 38, englishEnd: 41 },
        ],
        5
      )
      await vi.advanceTimersByTimeAsync(600)

      expect(englishPlayer.seekTo).toHaveBeenCalledWith(38, true)
      expect(englishPlayer.seekTo).not.toHaveBeenCalledWith(22, true)
    })

    it('stop halts the sequence so no segment is ever played', () => {
      const cantoPlayer = makePlayer([5, 10, 14])
      const englishPlayer = makePlayer([22])
      const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
      const controller = new SegmentPlaybackController(getPlayer, vi.fn(), 100)

      controller.playEpisodeAlternating([{ cantoStart: 10, cantoEnd: 14, englishStart: 22, englishEnd: 26 }], 5)
      controller.stop()
      vi.advanceTimersByTime(1000)

      expect(englishPlayer.seekTo).not.toHaveBeenCalled()
    })
  })
})
