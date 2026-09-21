'use client'

import { useEffect, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { CantoWord, DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { computeResyncTarget } from '@/lib/dub-sync/synced-playback'
import { findNextWordStart } from '@/lib/dub-sync/next-word-start'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'

interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
  cantoWordsByEpisode: Record<string, CantoWord[]>
}

function hasAllAnchors(episode: DubEpisode): episode is DubEpisode & EpisodeAnchors {
  return (
    episode.cantoContentStart !== null &&
    episode.cantoContentEnd !== null &&
    episode.englishContentStart !== null &&
    episode.englishContentEnd !== null
  )
}

export function Admin({
  episodes: initialEpisodes,
  segmentsByEpisode: initialSegments,
  cantoWordsByEpisode: initialCantoWords,
}: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [cantoWordsByEpisode, setCantoWordsByEpisode] = useState(initialCantoWords)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodes[0]?.id ?? null)

  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)

  const episode = episodes.find((candidate) => candidate.id === selectedEpisodeId) ?? null
  const segments = selectedEpisodeId ? (segmentsByEpisode[selectedEpisodeId] ?? []) : []
  const cantoWords = selectedEpisodeId ? (cantoWordsByEpisode[selectedEpisodeId] ?? []) : []

  function handleEpisodeCreated(newEpisode: DubEpisode) {
    setEpisodes((current) => [...current, newEpisode])
    setSegmentsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
    setCantoWordsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
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

  const [transcribeState, setTranscribeState] = useState<{ working: boolean; error: string | null }>({
    working: false,
    error: null,
  })

  async function runTranscribeCanto() {
    if (!episode) return
    setTranscribeState({ working: true, error: null })
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/transcribe-canto`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setTranscribeState({ working: false, error: body.error ?? 'Failed to transcribe Cantonese audio' })
      return
    }
    setCantoWordsByEpisode((current) => ({ ...current, [episode.id]: body.words }))
    setTranscribeState({ working: false, error: null })
  }

  const [syncing, setSyncing] = useState(false)

  function startSyncedPlayback() {
    if (!episode || !anchorsSet) return
    cantoPlayerRef.current?.playVideo()
    englishPlayerRef.current?.playVideo()
    setSyncing(true)
  }

  function stopSyncedPlayback() {
    cantoPlayerRef.current?.pauseVideo()
    englishPlayerRef.current?.pauseVideo()
    setSyncing(false)
  }

  useEffect(() => {
    if (!syncing || !episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    const interval = setInterval(() => {
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      const englishTime = englishPlayerRef.current?.getCurrentTime() ?? 0
      const target = computeResyncTarget(cantoTime, englishTime, anchors)
      if (target !== null) englishPlayerRef.current?.seekTo(target, true)
    }, 1000)
    return () => clearInterval(interval)
  }, [syncing, episode, anchorsSet])

  async function markSegmentEnd() {
    if (!episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    const cantoEnd = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishEnd = englishTimeFor(cantoEnd, anchors)

    const previousEnd = segments.length > 0 ? segments[segments.length - 1].cantoEnd : anchors.cantoContentStart
    const nextWordStart = findNextWordStart(cantoWords, previousEnd, anchors.cantoContentEnd)
    const cantoStart = nextWordStart ?? previousEnd
    const englishStart = englishTimeFor(cantoStart, anchors)

    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cantoStart, cantoEnd, englishStart, englishEnd }),
    })
    if (response.ok) {
      const { segment } = await response.json()
      setSegmentsByEpisode((current) => ({
        ...current,
        [episode.id]: [...(current[episode.id] ?? []), segment],
      }))
    }
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
              <button onClick={runTranscribeCanto} disabled={transcribeState.working} className="border p-2 rounded">
                {transcribeState.working ? 'Transcribing…' : 'Transcribe Cantonese'}
              </button>
              <button onClick={runGenerateFromCaptions} disabled={!anchorsSet} className="border p-2 rounded">
                Generate from captions
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={syncing ? stopSyncedPlayback : startSyncedPlayback}
                disabled={!anchorsSet}
                className="border p-2 rounded"
              >
                {syncing ? 'Pause synced' : 'Play synced'}
              </button>
              <button onClick={markSegmentEnd} disabled={!anchorsSet} className="border p-2 rounded">
                Mark segment end
              </button>
            </div>

            {transcribeState.error && (
              <p role="alert" className="text-red-600 mb-4">
                {transcribeState.error}
              </p>
            )}
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
