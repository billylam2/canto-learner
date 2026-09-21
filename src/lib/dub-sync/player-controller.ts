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

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
