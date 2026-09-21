'use client'

import { useEffect, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import { SegmentPlaybackController } from '@/lib/dub-sync/player-controller'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'

interface PlayerProps {
  episode: DubEpisode
  segments: DubSegment[]
}

type EpisodeModeState =
  | { status: 'inactive' }
  | { status: 'playing'; segmentIndex: number }
  | { status: 'waiting'; segmentIndex: number }
  | { status: 'complete' }

export function Player({ episode, segments }: PlayerProps) {
  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [episodeMode, setEpisodeMode] = useState<EpisodeModeState>({ status: 'inactive' })

  const controllerRef = useRef<SegmentPlaybackController | null>(null)

  useEffect(() => {
    controllerRef.current = new SegmentPlaybackController(
      (lang) => (lang === 'canto' ? cantoPlayerRef.current! : englishPlayerRef.current!),
      () => {}
    )
  }, [])

  function play(segmentIndex: number) {
    const segment = segments[segmentIndex]
    controllerRef.current?.playSegment('canto', { start: segment.cantoStart, end: segment.cantoEnd })
  }

  function playEnglish(segmentIndex: number) {
    const segment = segments[segmentIndex]
    controllerRef.current?.playSegment('english', { start: segment.englishStart, end: segment.englishEnd })
  }

  function playBoth(segmentIndex: number) {
    const segment = segments[segmentIndex]
    controllerRef.current?.playBoth(
      { start: segment.cantoStart, end: segment.cantoEnd },
      { start: segment.englishStart, end: segment.englishEnd }
    )
  }

  function playCantoLine(segmentIndex: number) {
    setEpisodeMode({ status: 'playing', segmentIndex })
    const segment = segments[segmentIndex]
    controllerRef.current?.playSegment('canto', { start: segment.cantoStart, end: segment.cantoEnd }, () =>
      setEpisodeMode({ status: 'waiting', segmentIndex })
    )
  }

  function startEpisode() {
    playCantoLine(0)
  }

  function replayCantoLine() {
    if (episodeMode.status !== 'waiting') return
    playCantoLine(episodeMode.segmentIndex)
  }

  function showEnglishLine() {
    if (episodeMode.status !== 'waiting') return
    const { segmentIndex } = episodeMode
    setEpisodeMode({ status: 'playing', segmentIndex })
    const segment = segments[segmentIndex]
    controllerRef.current?.playSegment('english', { start: segment.englishStart, end: segment.englishEnd }, () =>
      setEpisodeMode({ status: 'waiting', segmentIndex })
    )
  }

  function nextLine() {
    if (episodeMode.status !== 'waiting') return
    const nextIndex = episodeMode.segmentIndex + 1
    if (nextIndex < segments.length) {
      playCantoLine(nextIndex)
    } else {
      setEpisodeMode({ status: 'complete' })
    }
  }

  function stopEpisode() {
    controllerRef.current?.stop()
    setEpisodeMode({ status: 'inactive' })
  }

  const inEpisodeMode = episodeMode.status !== 'inactive'
  const currentEpisodeSegment =
    episodeMode.status === 'playing' || episodeMode.status === 'waiting' ? segments[episodeMode.segmentIndex] : null

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{episode.title}</h1>

      {/* The Cantonese video is always the one shown. The English video stays mounted (so its
          audio can play) but is always visually hidden — the picture on screen never cuts away,
          even while English audio plays over the frozen Cantonese frame. */}
      <div data-testid="canto-video-wrapper">
        <YoutubePlayer
          ref={cantoPlayerRef}
          videoId={episode.cantoneseVideoId}
          elementId="canto-player"
          onError={() => setPlayerError('This video is unavailable.')}
        />
      </div>
      <div data-testid="english-video-wrapper" className="sr-only">
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

      {inEpisodeMode ? (
        <div className="my-4 flex flex-col gap-2">
          {episodeMode.status === 'complete' ? (
            <p>Episode complete!</p>
          ) : (
            currentEpisodeSegment && <p>{currentEpisodeSegment.label ?? `Segment ${currentEpisodeSegment.position + 1}`}</p>
          )}
          <div className="flex gap-2">
            {episodeMode.status === 'waiting' && (
              <>
                <button onClick={replayCantoLine} className="border p-2 rounded">
                  Replay Cantonese
                </button>
                <button onClick={showEnglishLine} className="border p-2 rounded">
                  Show English
                </button>
                <button onClick={nextLine} className="border p-2 rounded">
                  Next line
                </button>
              </>
            )}
            <button onClick={stopEpisode} className="border p-2 rounded">
              Stop episode
            </button>
          </div>
        </div>
      ) : (
        <>
          {segments.length > 0 && (
            <button onClick={startEpisode} className="border p-2 rounded my-4">
              Play episode
            </button>
          )}

          <ul className="flex flex-col gap-2">
            {segments.map((segment, index) => (
              <li key={segment.id} className="flex items-center gap-2">
                <span>{segment.label ?? `Segment ${segment.position + 1}`}</span>
                <button onClick={() => play(index)} className="border p-1 rounded text-sm">
                  Play
                </button>
                <button onClick={() => playEnglish(index)} className="border p-1 rounded text-sm">
                  Play English
                </button>
                <button onClick={() => playBoth(index)} className="border p-1 rounded text-sm">
                  Play both
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
