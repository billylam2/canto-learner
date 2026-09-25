export interface YouTubePlayerLike {
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  getCurrentTime(): number
  setPlaybackRate?(rate: number): void
  mute?(): void
  unMute?(): void
  setVolume?(volume: number): void
  destroy?(): void
}

export type DubLanguage = 'canto' | 'english'

export interface PlaybackSegment {
  start: number
  end: number
}

export interface AlternatingSegment {
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

// A manual seek (forward or backward) moves currentTime by far more than one poll interval's
// worth of natural playback ever would, so it's used to tell "the user jumped somewhere" apart
// from "playback reached the segment boundary on its own."
const SEEK_JUMP_THRESHOLD_SECONDS = 2

// Quick enough not to make switches feel sluggish, but long enough to round off what was
// previously an instant, hard audio cut on every language swap.
const FADE_DURATION_MS = 150
const FADE_STEPS = 5

export class SegmentPlaybackController {
  private timer: ReturnType<typeof setInterval> | null = null
  private fadeTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private getPlayer: (lang: DubLanguage) => YouTubePlayerLike,
    private onLanguageChange: (lang: DubLanguage) => void,
    private pollIntervalMs = 200
  ) {}

  // Ramps a player's volume linearly over FADE_DURATION_MS. Falls back to resolving immediately
  // when the underlying player doesn't support setVolume (e.g. bare test doubles), so callers
  // never need their own capability check.
  private fadeVolume(player: YouTubePlayerLike, from: number, to: number): Promise<void> {
    if (typeof player.setVolume !== 'function') return Promise.resolve()
    return new Promise((resolve) => {
      let step = 0
      this.fadeTimer = setInterval(() => {
        step += 1
        player.setVolume!(Math.round(from + ((to - from) * step) / FADE_STEPS))
        if (step >= FADE_STEPS) {
          if (this.fadeTimer) {
            clearInterval(this.fadeTimer)
            this.fadeTimer = null
          }
          resolve()
        }
      }, FADE_DURATION_MS / FADE_STEPS)
    })
  }

  // Fades a player's audio down to silent before pausing it, so the outgoing side of a language
  // swap doesn't cut off mid-word. Exported for callers (like a manual "replay in English") that
  // pause a player directly rather than through playSegment/watchForSegmentEnd below.
  pauseWithFade(player: YouTubePlayerLike): Promise<void> {
    return this.fadeVolume(player, 100, 0).then(() => player.pauseVideo())
  }

  // The counterpart to pauseWithFade: starts a player silent (optionally seeking first) and
  // fades its audio up to full, for the incoming side of a language swap.
  playWithFade(player: YouTubePlayerLike, seekSeconds?: number): void {
    player.setVolume?.(0)
    if (seekSeconds !== undefined) player.seekTo(seekSeconds, true)
    player.playVideo()
    this.fadeVolume(player, 0, 100)
  }

  playSegment(lang: DubLanguage, segment: PlaybackSegment, onDone?: () => void): void {
    this.stop()
    this.onLanguageChange(lang)
    const player = this.getPlayer(lang)
    this.playWithFade(player, segment.start)

    this.timer = setInterval(() => {
      if (player.getCurrentTime() >= segment.end) {
        this.stop()
        this.pauseWithFade(player).then(() => onDone?.())
      }
    }, this.pollIntervalMs)
  }

  playBoth(cantoSegment: PlaybackSegment, englishSegment: PlaybackSegment): void {
    this.playSegment('canto', cantoSegment, () => {
      this.playSegment('english', englishSegment)
    })
  }

  // Plays the Cantonese video continuously from startTime, only ever intervening at each
  // marked segment's cantoEnd: pausing Cantonese, playing that segment's English audio, then
  // resuming Cantonese from exactly where it left off. Everything else — gaps between segments,
  // and the Cantonese portion of each segment itself — is untouched native playback, so only
  // marked segments alternate languages; unmarked stretches stay in Cantonese throughout.
  playEpisodeAlternating(segments: AlternatingSegment[], startTime: number): void {
    this.stop()
    const sorted = [...segments].sort((a, b) => a.cantoStart - b.cantoStart)
    const cantoPlayer = this.getPlayer('canto')
    const englishPlayer = this.getPlayer('english')
    this.onLanguageChange('canto')
    cantoPlayer.seekTo(startTime, true)
    cantoPlayer.playVideo()
    // Mobile Safari (and other mobile browsers) only allow a video element's first-ever play()
    // to succeed when it's called synchronously within a user gesture — every later programmatic
    // play (e.g. from watchForSegmentEnd's interval below, switching to English mid-episode)
    // would otherwise be silently blocked. Canto gets that one-time unlock from the call just
    // above; priming English here — muted, so nothing audible happens — satisfies the same
    // requirement for it, so its later async plays aren't blocked.
    englishPlayer.mute?.()
    englishPlayer.playVideo()
    englishPlayer.pauseVideo()
    englishPlayer.unMute?.()
    const startIndex = sorted.findIndex((segment) => segment.cantoEnd > startTime)
    this.watchForSegmentEnd(sorted, startIndex)
  }

  private watchForSegmentEnd(segments: AlternatingSegment[], index: number): void {
    if (index === -1 || index >= segments.length) return
    const segment = segments[index]
    const cantoPlayer = this.getPlayer('canto')
    let lastKnownTime: number | null = null

    this.timer = setInterval(() => {
      const currentTime = cantoPlayer.getCurrentTime()
      const jumped = lastKnownTime !== null && Math.abs(currentTime - lastKnownTime) > SEEK_JUMP_THRESHOLD_SECONDS
      lastKnownTime = currentTime

      // A manual seek past (or before) this segment's boundary isn't "the segment finished" —
      // re-locate which segment the new position falls in and resume watching from there,
      // instead of firing the pause-and-play-English-audio flow the user didn't ask for.
      if (jumped) {
        this.stop()
        const newIndex = segments.findIndex((s) => s.cantoEnd > currentTime)
        this.watchForSegmentEnd(segments, newIndex)
        return
      }

      if (currentTime >= segment.cantoEnd) {
        this.stop()
        this.pauseWithFade(cantoPlayer).then(() => {
          this.playSegment('english', { start: segment.englishStart, end: segment.englishEnd }, () => {
            this.onLanguageChange('canto')
            this.playWithFade(cantoPlayer, segment.cantoEnd)
            this.watchForSegmentEnd(segments, index + 1)
          })
        })
      }
    }, this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer)
      this.fadeTimer = null
    }
  }
}
