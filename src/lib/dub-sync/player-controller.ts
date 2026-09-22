export interface YouTubePlayerLike {
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  getCurrentTime(): number
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

export class SegmentPlaybackController {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private getPlayer: (lang: DubLanguage) => YouTubePlayerLike,
    private onLanguageChange: (lang: DubLanguage) => void,
    private pollIntervalMs = 200
  ) {}

  playSegment(lang: DubLanguage, segment: PlaybackSegment, onDone?: () => void): void {
    this.stop()
    this.onLanguageChange(lang)
    const player = this.getPlayer(lang)
    player.seekTo(segment.start, true)
    player.playVideo()

    this.timer = setInterval(() => {
      if (player.getCurrentTime() >= segment.end) {
        player.pauseVideo()
        this.stop()
        onDone?.()
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
    this.onLanguageChange('canto')
    cantoPlayer.seekTo(startTime, true)
    cantoPlayer.playVideo()
    const startIndex = sorted.findIndex((segment) => segment.cantoEnd > startTime)
    this.watchForSegmentEnd(sorted, startIndex)
  }

  private watchForSegmentEnd(segments: AlternatingSegment[], index: number): void {
    if (index === -1 || index >= segments.length) return
    const segment = segments[index]
    const cantoPlayer = this.getPlayer('canto')

    this.timer = setInterval(() => {
      if (cantoPlayer.getCurrentTime() >= segment.cantoEnd) {
        this.stop()
        cantoPlayer.pauseVideo()
        this.playSegment('english', { start: segment.englishStart, end: segment.englishEnd }, () => {
          this.onLanguageChange('canto')
          cantoPlayer.seekTo(segment.cantoEnd, true)
          cantoPlayer.playVideo()
          this.watchForSegmentEnd(segments, index + 1)
        })
      }
    }, this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
