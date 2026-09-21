import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SegmentPlaybackController, type YouTubePlayerLike, type DubLanguage } from './player-controller'

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

  it('pauses once playback passes the segment end', () => {
    const cantoPlayer = makePlayer([10, 11, 12, 15])
    const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)
    controller.playSegment('canto', { start: 10, end: 14 })
    vi.advanceTimersByTime(400)
    expect(cantoPlayer.pauseVideo).toHaveBeenCalled()
  })

  it('calls onDone once when the segment ends', () => {
    const cantoPlayer = makePlayer([10, 15])
    const onDone = vi.fn()
    const controller = new SegmentPlaybackController(() => cantoPlayer, vi.fn(), 100)
    controller.playSegment('canto', { start: 10, end: 14 }, onDone)
    vi.advanceTimersByTime(300)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('playBoth plays canto then chains to english once the canto segment ends', () => {
    const cantoPlayer = makePlayer([10, 14, 15])
    const englishPlayer = makePlayer([8, 9])
    const getPlayer = vi.fn((lang: DubLanguage) => (lang === 'canto' ? cantoPlayer : englishPlayer))
    const onLanguageChange = vi.fn()
    const controller = new SegmentPlaybackController(getPlayer, onLanguageChange, 100)

    controller.playBoth({ start: 10, end: 14 }, { start: 8, end: 12 })
    expect(onLanguageChange).toHaveBeenCalledWith('canto')

    vi.advanceTimersByTime(300)

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
})
