'use client'

import { useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { type EpisodeAnchors } from '@/lib/dub-sync/normalize'

interface EditorProps {
  episode: DubEpisode
  segments: DubSegment[]
}

function hasAllAnchors(episode: DubEpisode): episode is DubEpisode & EpisodeAnchors {
  return (
    episode.cantoContentStart !== null &&
    episode.cantoContentEnd !== null &&
    episode.englishContentStart !== null &&
    episode.englishContentEnd !== null
  )
}

export function Editor({ episode: initialEpisode, segments: initialSegments }: EditorProps) {
  const [episode, setEpisode] = useState(initialEpisode)
  const [segments, setSegments] = useState(initialSegments)
  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)

  const anchorsSet = hasAllAnchors(episode)

  async function saveAnchors(next: {
    cantoContentStart: number
    cantoContentEnd: number
    englishContentStart: number
    englishContentEnd: number
  }) {
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (response.ok) {
      const { episode: updated } = await response.json()
      setEpisode(updated)
    }
  }

  function markCantoStart() {
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: time,
      cantoContentEnd: episode.cantoContentEnd ?? time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markCantoEnd() {
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markEnglishStart() {
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: time,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markEnglishEnd() {
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: time,
    })
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{episode.title}</h1>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <YoutubePlayer ref={cantoPlayerRef} videoId={episode.cantoneseVideoId} elementId="canto-player" />
          <div className="flex gap-2 mt-2">
            <button onClick={markCantoStart} className="border p-1 rounded">
              Mark content start
            </button>
            <button onClick={markCantoEnd} className="border p-1 rounded">
              Mark content end
            </button>
          </div>
        </div>
        <div>
          <YoutubePlayer ref={englishPlayerRef} videoId={episode.englishVideoId} elementId="english-player" />
          <div className="flex gap-2 mt-2">
            <button onClick={markEnglishStart} className="border p-1 rounded">
              Mark content start
            </button>
            <button onClick={markEnglishEnd} className="border p-1 rounded">
              Mark content end
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button disabled={!anchorsSet} className="border p-2 rounded">
          Mark start
        </button>
        <button disabled={!anchorsSet} className="border p-2 rounded">
          Generate from captions
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.id}>
            {segment.label ?? `Segment ${segment.position + 1}`} — {segment.cantoStart}s–{segment.cantoEnd}s
          </li>
        ))}
      </ul>
    </main>
  )
}
