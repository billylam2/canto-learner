'use client'

import { useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { NewEpisodeForm } from './new-episode-form'

interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
}

function hasAllAnchors(episode: DubEpisode): episode is DubEpisode & EpisodeAnchors {
  return (
    episode.cantoContentStart !== null &&
    episode.cantoContentEnd !== null &&
    episode.englishContentStart !== null &&
    episode.englishContentEnd !== null
  )
}

export function Admin({ episodes: initialEpisodes, segmentsByEpisode: initialSegments }: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodes[0]?.id ?? null)

  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)

  const episode = episodes.find((candidate) => candidate.id === selectedEpisodeId) ?? null
  const segments = selectedEpisodeId ? (segmentsByEpisode[selectedEpisodeId] ?? []) : []

  function handleEpisodeCreated(newEpisode: DubEpisode) {
    setEpisodes((current) => [...current, newEpisode])
    setSegmentsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
    setSelectedEpisodeId(newEpisode.id)
  }

  function updateEpisodeInPlace(updated: DubEpisode) {
    setEpisodes((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)))
  }

  async function saveAnchors(next: {
    cantoContentStart: number
    cantoContentEnd: number
    englishContentStart: number
    englishContentEnd: number
  }) {
    if (!episode) return
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (response.ok) {
      const { episode: updated } = await response.json()
      updateEpisodeInPlace(updated)
    }
  }

  function markCantoStart() {
    if (!episode) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: time,
      cantoContentEnd: episode.cantoContentEnd ?? time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markCantoEnd() {
    if (!episode) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markEnglishStart() {
    if (!episode) return
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: time,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markEnglishEnd() {
    if (!episode) return
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: time,
    })
  }

  const anchorsSet = episode ? hasAllAnchors(episode) : false

  return (
    <div className="flex gap-6 p-6">
      <aside className="w-64 flex flex-col gap-2">
        <h2 className="font-bold">Episodes</h2>
        <ul className="flex flex-col gap-1">
          {episodes.map((candidate) => (
            <li key={candidate.id}>
              <button
                onClick={() => setSelectedEpisodeId(candidate.id)}
                className={`text-left w-full p-1 rounded ${candidate.id === selectedEpisodeId ? 'bg-gray-200' : ''}`}
              >
                {candidate.title}
              </button>
            </li>
          ))}
        </ul>
        <NewEpisodeForm onCreated={handleEpisodeCreated} />
      </aside>

      <main className="flex-1">
        {!episode ? (
          <p className="text-gray-500">No episode selected.</p>
        ) : (
          <>
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
            {/* Segment table, manual add, and auto-mark controls are added in later tasks. */}
            {!anchorsSet && <p className="text-gray-500">Set anchors before marking segments.</p>}
            <p className="text-sm text-gray-500">{segments.length} segment(s)</p>
          </>
        )}
      </main>
    </div>
  )
}
