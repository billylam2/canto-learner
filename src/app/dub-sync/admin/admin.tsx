'use client'

import { useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'

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

  function handleSegmentUpdated(updated: DubSegment) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].map((s) => (s.id === updated.id ? updated : s)),
    }))
  }

  function handleSegmentDeleted(segmentId: string) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].filter((s) => s.id !== segmentId),
    }))
  }

  const [pendingSegment, setPendingSegment] = useState<{
    cantoStart: number
    cantoEnd: number | null
    englishStart: number
    englishEnd: number | null
  } | null>(null)

  function markSegmentStart() {
    if (!episode || !anchorsSet) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishStart = englishTimeFor(time, episode as DubEpisode & EpisodeAnchors)
    setPendingSegment({ cantoStart: time, cantoEnd: null, englishStart, englishEnd: null })
    englishPlayerRef.current?.seekTo(englishStart, true)
  }

  function markSegmentEnd() {
    if (!episode || !pendingSegment || !anchorsSet) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishEnd = englishTimeFor(time, episode as DubEpisode & EpisodeAnchors)
    setPendingSegment({ ...pendingSegment, cantoEnd: time, englishEnd })
    englishPlayerRef.current?.seekTo(englishEnd, true)
  }

  async function saveSegment() {
    if (!episode || !pendingSegment || pendingSegment.cantoEnd === null || pendingSegment.englishEnd === null) return
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cantoStart: pendingSegment.cantoStart,
        cantoEnd: pendingSegment.cantoEnd,
        englishStart: pendingSegment.englishStart,
        englishEnd: pendingSegment.englishEnd,
      }),
    })
    if (response.ok) {
      const { segment } = await response.json()
      setSegmentsByEpisode((current) => ({
        ...current,
        [episode.id]: [...(current[episode.id] ?? []), segment],
      }))
      setPendingSegment(null)
    }
  }

  const [autoMarkState, setAutoMarkState] = useState<{
    working: boolean
    error: string | null
    warning: string | null
  }>({
    working: false,
    error: null,
    warning: null,
  })

  async function runAutoMark() {
    if (!episode) return
    setAutoMarkState({ working: true, error: null, warning: null })
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/auto-mark`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setAutoMarkState({ working: false, error: body.error ?? 'Failed to auto-mark segments', warning: null })
      return
    }
    setSegmentsByEpisode((current) => ({
      ...current,
      [episode.id]: [...(current[episode.id] ?? []), ...body.segments],
    }))
    setAutoMarkState({ working: false, error: null, warning: body.warning ?? null })
  }

  const [captionsError, setCaptionsError] = useState<string | null>(null)

  async function runGenerateFromCaptions() {
    if (!episode) return
    setCaptionsError(null)
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/generate-segments`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setCaptionsError(body.error ?? 'Failed to generate segments')
      return
    }
    setSegmentsByEpisode((current) => ({
      ...current,
      [episode.id]: [...(current[episode.id] ?? []), ...body.segments],
    }))
  }

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
            {!anchorsSet && <p className="text-gray-500 mb-4">Set anchors before marking segments.</p>}

            <div className="flex gap-2 mb-4">
              <button onClick={markSegmentStart} disabled={!anchorsSet} className="border p-2 rounded">
                Mark start
              </button>
              <button
                onClick={markSegmentEnd}
                disabled={!anchorsSet || !pendingSegment}
                className="border p-2 rounded"
              >
                Mark end
              </button>
              <button
                onClick={saveSegment}
                disabled={!pendingSegment || pendingSegment.cantoEnd === null}
                className="border p-2 rounded"
              >
                Save segment
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={runAutoMark}
                disabled={!anchorsSet || autoMarkState.working}
                className="border p-2 rounded"
              >
                {autoMarkState.working ? 'Working…' : 'Auto-mark from speech'}
              </button>
              <button onClick={runGenerateFromCaptions} disabled={!anchorsSet} className="border p-2 rounded">
                Generate from captions
              </button>
            </div>

            {autoMarkState.error && (
              <p role="alert" className="text-red-600 mb-4">
                {autoMarkState.error}
              </p>
            )}
            {autoMarkState.warning && <p className="text-amber-600 mb-4">{autoMarkState.warning}</p>}
            {captionsError && (
              <p role="alert" className="text-red-600 mb-4">
                {captionsError}
              </p>
            )}

            <SegmentTable
              episodeId={episode.id}
              segments={segments}
              onUpdate={handleSegmentUpdated}
              onDelete={handleSegmentDeleted}
            />
          </>
        )}
      </main>
    </div>
  )
}
