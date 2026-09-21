'use client'

import { useEffect, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import { SegmentPlaybackController, type DubLanguage } from '@/lib/dub-sync/player-controller'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'

interface PlayerProps {
  episode: DubEpisode
  segments: DubSegment[]
}

export function Player({ episode, segments }: PlayerProps) {
  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)
  const [activeLanguage, setActiveLanguage] = useState<DubLanguage>('canto')
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [playerError, setPlayerError] = useState<string | null>(null)

  const controllerRef = useRef<SegmentPlaybackController | null>(null)

  useEffect(() => {
    controllerRef.current = new SegmentPlaybackController(
      (lang) => (lang === 'canto' ? cantoPlayerRef.current! : englishPlayerRef.current!),
      setActiveLanguage
    )
  }, [])

  const currentSegment = segments[currentSegmentIndex]

  function play(segmentIndex: number) {
    setCurrentSegmentIndex(segmentIndex)
    const segment = segments[segmentIndex]
    controllerRef.current?.playSegment(activeLanguage, {
      start: activeLanguage === 'canto' ? segment.cantoStart : segment.englishStart,
      end: activeLanguage === 'canto' ? segment.cantoEnd : segment.englishEnd,
    })
  }

  function playBoth(segmentIndex: number) {
    setCurrentSegmentIndex(segmentIndex)
    const segment = segments[segmentIndex]
    controllerRef.current?.playBoth(
      { start: segment.cantoStart, end: segment.cantoEnd },
      { start: segment.englishStart, end: segment.englishEnd }
    )
  }

  function switchLanguage() {
    if (!currentSegment) return
    const nextLanguage: DubLanguage = activeLanguage === 'canto' ? 'english' : 'canto'
    controllerRef.current?.playSegment(nextLanguage, {
      start: nextLanguage === 'canto' ? currentSegment.cantoStart : currentSegment.englishStart,
      end: nextLanguage === 'canto' ? currentSegment.cantoEnd : currentSegment.englishEnd,
    })
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{episode.title}</h1>

      {/* Both players stay mounted with fixed elementId/videoId props for their whole lifetime —
          only visibility toggles. Swapping which branch renders which player instead would make
          React reconcile them as the same position and recreate the underlying YT.Player on every
          language switch, destroying playback state. */}
      <div className={activeLanguage === 'canto' ? '' : 'hidden'}>
        <YoutubePlayer
          ref={cantoPlayerRef}
          videoId={episode.cantoneseVideoId}
          elementId="canto-player"
          onError={() => setPlayerError('This video is unavailable.')}
        />
      </div>
      <div className={activeLanguage === 'english' ? '' : 'hidden'}>
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

      <button onClick={switchLanguage} className="border p-2 rounded my-4">
        Switch language
      </button>

      <ul className="flex flex-col gap-2">
        {segments.map((segment, index) => (
          <li key={segment.id} className="flex items-center gap-2">
            <span>{segment.label ?? `Segment ${segment.position + 1}`}</span>
            <button onClick={() => play(index)} className="border p-1 rounded text-sm">
              Play
            </button>
            <button onClick={() => playBoth(index)} className="border p-1 rounded text-sm">
              Play both
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
