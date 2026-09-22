'use client'

import { useEffect, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import { SegmentPlaybackController } from '@/lib/dub-sync/player-controller'
import { findLastPlayedSegment } from '@/lib/dub-sync/find-last-played-segment'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'

interface PlayerProps {
  episode: DubEpisode
  segments: DubSegment[]
}

export function Player({ episode, segments }: PlayerProps) {
  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [replayMessage, setReplayMessage] = useState<string | null>(null)
  const [visibleLanguage, setVisibleLanguage] = useState<'canto' | 'english'>('canto')

  const controllerRef = useRef<SegmentPlaybackController | null>(null)

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

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{episode.title}</h1>

      {/* Both videos stay mounted at all times (so either one's audio can play regardless of which
          is shown), but only one is ever visible at once — the Cantonese video normally, swapping
          to the English video for the duration of a "Replay in English" playback. */}
      <div data-testid="canto-video-wrapper" className={visibleLanguage === 'canto' ? undefined : 'sr-only'}>
        <YoutubePlayer
          ref={cantoPlayerRef}
          videoId={episode.cantoneseVideoId}
          elementId="canto-player"
          onError={() => setPlayerError('This video is unavailable.')}
        />
      </div>
      <div data-testid="english-video-wrapper" className={visibleLanguage === 'english' ? undefined : 'sr-only'}>
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

      <button onClick={replayInEnglish} className="border p-2 rounded my-4">
        Replay in English
      </button>

      {replayMessage && <p className="text-gray-600">{replayMessage}</p>}
    </main>
  )
}
