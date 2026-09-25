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
  // isFullscreen drives our own CSS full-viewport treatment; nativeFullscreenActive tracks
  // whether the browser's Fullscreen API actually engaged (confirmed via the fullscreenchange
  // event below). They're deliberately separate: iOS Safari has no support for calling
  // requestFullscreen() on a plain element (only <video> gets native fullscreen there), so
  // requestFullscreen() silently does nothing — without this split, clicking Fullscreen would
  // just appear broken. isFullscreen alone still gives the full-viewport video treatment
  // everywhere; nativeFullscreenActive only affects whether we also show our own exit control
  // (unnecessary when the browser's own Esc-to-exit is available).
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [nativeFullscreenActive, setNativeFullscreenActive] = useState(false)
  const playerContainerRef = useRef<HTMLDivElement>(null)

  const controllerRef = useRef<SegmentPlaybackController | null>(null)

  useEffect(() => {
    function handleFullscreenChange() {
      const active = document.fullscreenElement === playerContainerRef.current
      setNativeFullscreenActive(active)
      // The browser can exit fullscreen on its own (Esc key) — follow it out of our own
      // full-viewport state too, rather than leaving a video-sized black rectangle stranded.
      if (!active) setIsFullscreen(false)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Sizes the shared video box to fill as much of the screen as the 16:9 aspect ratio allows
  // (the same min(100vw, 100vh*16/9) x min(100vh, 100vw*9/16) formula browsers use for native
  // fullscreen video), and forces the underlying iframes (which YT sizes via width/height HTML
  // attributes, not CSS) to fill it. Outside fullscreen, the box is instead sized fluidly (100%
  // width, 16:9 height) so it shrinks to fit narrow/mobile viewports rather than staying at a
  // fixed pixel width and overflowing into the sidebar. Both videos share this one box (see the
  // comment on the wrapper markup below) so it doesn't change size across a language swap.
  function videoBoxClassName(): string {
    if (isFullscreen) return 'relative [&_iframe]:w-full [&_iframe]:h-full w-[min(100vw,177.78vh)] h-[min(100vh,56.25vw)]'
    return 'relative [&_iframe]:w-full [&_iframe]:h-full w-full max-w-[960px] aspect-video'
  }

  // Both videos are absolutely stacked in the same box and cross-fade via opacity instead of
  // being swapped in/out of layout — swapping used to collapse the hidden video down to a 1x1px
  // sr-only box and back, which forced YouTube's iframe to redraw at a drastically different
  // size on every switch and was the source of the white flash on each language change; opacity
  // alone never changes the iframe's rendered size. The transition also softens what was an
  // instant hard cut into a brief crossfade.
  function videoLayerClassName(isVisibleVideo: boolean): string {
    const visibility = isVisibleVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
    return `absolute inset-0 transition-opacity duration-300 ${visibility}`
  }

  function toggleFullscreen() {
    if (isFullscreen) {
      setIsFullscreen(false)
      if (nativeFullscreenActive) document.exitFullscreen().catch(() => {})
      return
    }
    setIsFullscreen(true)
    const element = playerContainerRef.current
    if (element && typeof element.requestFullscreen === 'function') {
      try {
        element.requestFullscreen().catch(() => {})
      } catch {
        // Some browsers throw synchronously rather than rejecting the promise; either way,
        // isFullscreen above already applies the CSS-only fallback treatment.
      }
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
    <main className="flex flex-col lg:flex-row gap-6 p-6">
      <div className="flex-1 min-w-0 lg:max-w-3xl">
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
        <div className={videoBoxClassName()}>
          <div
            data-testid="canto-video-wrapper"
            className={videoLayerClassName(visibleLanguage === 'canto')}
            aria-hidden={visibleLanguage !== 'canto'}
          >
            <YoutubePlayer
              ref={cantoPlayerRef}
              videoId={episode.cantoneseVideoId}
              elementId="canto-player"
              onError={() => setPlayerError('This video is unavailable.')}
              onEnded={goToNextEpisode}
            />
          </div>
          <div
            data-testid="english-video-wrapper"
            className={videoLayerClassName(visibleLanguage === 'english')}
            aria-hidden={visibleLanguage !== 'english'}
          >
            <YoutubePlayer
              ref={englishPlayerRef}
              videoId={episode.englishVideoId}
              elementId="english-player"
              onError={() => setPlayerError('This video is unavailable.')}
            />
          </div>
        </div>

        {playerError && (
          <p role="alert" className="text-red-600 my-2">
            {playerError}
          </p>
        )}

        {/* In fullscreen, the video fills the screen (see videoBoxClassName above) with
            nothing overlaid on top of it — no controls, so nothing sits over the video's own
            captions. Exiting relies on the browser's own fullscreen exit (Esc key), which the
            fullscreenchange listener above already picks up — EXCEPT when native fullscreen
            never actually engaged (iOS Safari), where Esc doesn't apply either, so a small exit
            control is shown instead as the only way out. */}
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
        {isFullscreen && !nativeFullscreenActive && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-4 right-4 border border-white text-white bg-black/50 p-2 rounded"
          >
            Exit fullscreen
          </button>
        )}
      </div>
      </div>

      <EpisodeSidebar episodes={episodes} currentEpisodeId={episode.id} />
    </main>
  )
}
