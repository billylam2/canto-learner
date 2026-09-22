'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import { SegmentPlaybackController } from '@/lib/dub-sync/player-controller'
import { findLastPlayedSegment } from '@/lib/dub-sync/find-last-played-segment'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { EpisodeSidebar } from './episode-sidebar'

interface PlayerProps {
  episode: DubEpisode
  segments: DubSegment[]
  episodes: DubEpisode[]
}

export function Player({ episode, segments, episodes }: PlayerProps) {
  const router = useRouter()
  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [replayMessage, setReplayMessage] = useState<string | null>(null)
  const [visibleLanguage, setVisibleLanguage] = useState<'canto' | 'english'>('canto')
  const [alternating, setAlternating] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const playerContainerRef = useRef<HTMLDivElement>(null)

  const controllerRef = useRef<SegmentPlaybackController | null>(null)

  // Tracks whether OUR container (video wrappers + controls together) is the fullscreened
  // element, rather than relying on the toggle button's own click state — the browser can also
  // exit fullscreen on its own (Esc key), which this listener catches too.
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === playerContainerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Sizes the visible video to fill as much of the screen as the 16:9 aspect ratio allows
  // (the same min(100vw, 100vh*16/9) x min(100vh, 100vw*9/16) formula browsers use for native
  // fullscreen video), and forces the underlying iframe (which YT sizes via width/height HTML
  // attributes, not CSS) to fill that box.
  function videoWrapperClassName(isVisibleVideo: boolean): string | undefined {
    if (!isVisibleVideo) return 'sr-only'
    if (!isFullscreen) return undefined
    return '[&_iframe]:w-full [&_iframe]:h-full w-[min(100vw,177.78vh)] h-[min(100vh,56.25vw)]'
  }

  function toggleFullscreen() {
    if (document.fullscreenElement === playerContainerRef.current) {
      document.exitFullscreen()
    } else {
      playerContainerRef.current?.requestFullscreen()
    }
  }

  useEffect(() => {
    controllerRef.current = new SegmentPlaybackController(
      (lang) => (lang === 'canto' ? cantoPlayerRef.current! : englishPlayerRef.current!),
      setVisibleLanguage
    )
  }, [])

  function replayInEnglish() {
    const currentTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const segment = findLastPlayedSegment(currentTime, segments)
    if (!segment) {
      setReplayMessage('No line to replay yet.')
      return
    }

    setReplayMessage(null)
    cantoPlayerRef.current?.pauseVideo()
    controllerRef.current?.playSegment('english', { start: segment.englishStart, end: segment.englishEnd }, () => {
      setVisibleLanguage('canto')
      cantoPlayerRef.current?.playVideo()
    })
  }

  // Auto-advances the playlist once the Cantonese video reaches its natural end (the real end
  // of the video, not any marked content boundary). Does nothing on the last episode.
  function goToNextEpisode() {
    const currentIndex = episodes.findIndex((candidate) => candidate.id === episode.id)
    const nextEpisode = currentIndex === -1 ? undefined : episodes[currentIndex + 1]
    if (nextEpisode) router.push(`/dub-sync/${nextEpisode.id}`)
  }

  function toggleAlternating() {
    if (alternating) {
      controllerRef.current?.stop()
      setAlternating(false)
      return
    }
    const startTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
    setReplayMessage(null)
    setAlternating(true)
    controllerRef.current?.playEpisodeAlternating(segments, startTime)
  }

  return (
    <main className="flex gap-6 p-6">
      <div className="flex-1 max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">{episode.title}</h1>

      {/* Wraps the videos AND the controls together so fullscreen (via our own button below,
          not YouTube's — see youtube-iframe-api.ts) fullscreens all of it as one element. Both
          videos stay mounted at all times (so either one's audio can play regardless of which is
          shown), but only one is ever visible at once — the Cantonese video normally, swapping to
          the English video for the duration of a "Replay in English" or alternating playback. */}
      <div
        ref={playerContainerRef}
        className={isFullscreen ? 'fixed inset-0 z-50 flex items-center justify-center bg-black' : undefined}
      >
        <div data-testid="canto-video-wrapper" className={videoWrapperClassName(visibleLanguage === 'canto')}>
          <YoutubePlayer
            ref={cantoPlayerRef}
            videoId={episode.cantoneseVideoId}
            elementId="canto-player"
            onError={() => setPlayerError('This video is unavailable.')}
            onEnded={goToNextEpisode}
          />
        </div>
        <div data-testid="english-video-wrapper" className={videoWrapperClassName(visibleLanguage === 'english')}>
          <YoutubePlayer
            ref={englishPlayerRef}
            videoId={episode.englishVideoId}
            elementId="english-player"
            onError={() => setPlayerError('This video is unavailable.')}
          />
        </div>

        {playerError && (
          <p role="alert" className="text-red-600 my-2">
            {playerError}
          </p>
        )}

        {/* In fullscreen, the video fills the screen (see videoWrapperClassName above) with
            nothing overlaid on top of it — no controls, so nothing sits over the video's own
            captions. Exiting relies on the browser's own fullscreen exit (Esc key), which the
            fullscreenchange listener above already picks up. */}
        {!isFullscreen && (
          <div>
            <div className="flex gap-2">
              <button onClick={replayInEnglish} disabled={alternating} className="border p-2 rounded my-4">
                Replay in English
              </button>
              <button onClick={toggleAlternating} className="border p-2 rounded my-4">
                {alternating ? 'Stop alternating' : 'Play alternating'}
              </button>
              <button onClick={toggleFullscreen} className="border p-2 rounded my-4">
                Fullscreen
              </button>
            </div>

            {replayMessage && <p className="text-gray-600">{replayMessage}</p>}
          </div>
        )}
      </div>
      </div>

      <EpisodeSidebar episodes={episodes} currentEpisodeId={episode.id} />
    </main>
  )
}
