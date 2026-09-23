'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { computeResyncTarget } from '@/lib/dub-sync/synced-playback'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'
import { AnchorFields } from './anchor-fields'

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
  // segmentsByEpisode only updates once a POST's response comes back, so releasing space again
  // before that response lands would otherwise compute the same start twice (rapid marking is
  // exactly how this feature is meant to be used). This ref advances synchronously, before the
  // request even goes out, so each press always sees the immediately preceding one's end
  // regardless of network timing.
  const nextSegmentStartFloorRef = useRef<Record<string, number>>({})
  const pendingSegmentStartRef = useRef<number | null>(null)

  const episode = episodes.find((candidate) => candidate.id === selectedEpisodeId) ?? null
  const segments = useMemo(
    () => (selectedEpisodeId ? (segmentsByEpisode[selectedEpisodeId] ?? []) : []),
    [selectedEpisodeId, segmentsByEpisode]
  )

  function selectEpisode(id: string) {
    setSelectedEpisodeId(id)
    setRefineSuggestion(null)
    setRefineError(null)
  }

  function handleEpisodeCreated(newEpisode: DubEpisode) {
    setEpisodes((current) => [...current, newEpisode])
    setSegmentsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
    selectEpisode(newEpisode.id)
  }

  function updateEpisodeInPlace(updated: DubEpisode) {
    setEpisodes((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)))
  }

  // Resets the draft whenever the selected episode's title changes — either from switching
  // episodes or from a successful rename elsewhere. See anchor-fields.tsx for the same pattern.
  const [titleDraft, setTitleDraft] = useState(episode?.title ?? '')
  const [previousEpisodeTitle, setPreviousEpisodeTitle] = useState(episode?.title ?? '')
  if ((episode?.title ?? '') !== previousEpisodeTitle) {
    setPreviousEpisodeTitle(episode?.title ?? '')
    setTitleDraft(episode?.title ?? '')
  }

  async function saveTitle() {
    if (!episode || titleDraft === episode.title) return
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: titleDraft }),
    })
    if (response.ok) {
      const { episode: updated } = await response.json()
      updateEpisodeInPlace(updated)
    }
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

  function editCantoStart(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: value,
      cantoContentEnd: episode.cantoContentEnd ?? value,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function editCantoEnd(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: value,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function editEnglishStart(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: value,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function editEnglishEnd(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: value,
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
  const canRefineAlignment = episode ? episode.cantoContentStart !== null && episode.englishContentStart !== null : false

  interface RefineSuggestion {
    suggestedEnglishContentStart: number
    startOffsetSeconds: number
    startAvgDistance: number
    startConfident: boolean
    suggestedEnglishContentEnd: number | null
    endOffsetSeconds: number | null
    endAvgDistance: number | null
    endConfident: boolean | null
  }
  const [refining, setRefining] = useState(false)
  const [refineSuggestion, setRefineSuggestion] = useState<RefineSuggestion | null>(null)
  const [refineError, setRefineError] = useState<string | null>(null)

  async function runRefineAlignment() {
    if (!episode) return
    setRefining(true)
    setRefineError(null)
    setRefineSuggestion(null)
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/refine-alignment`, { method: 'POST' })
    setRefining(false)
    const body = await response.json()
    if (!response.ok) {
      setRefineError(body.error ?? 'Failed to refine alignment')
      return
    }
    setRefineSuggestion(body)
  }

  function applyRefineSuggestion() {
    if (!episode || !refineSuggestion) return
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: refineSuggestion.suggestedEnglishContentStart,
      englishContentEnd: refineSuggestion.suggestedEnglishContentEnd ?? episode.englishContentEnd ?? 0,
    })
    setRefineSuggestion(null)
  }

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
    // Force the next marked segment to recompute the floor from fresh segments state, rather
    // than keep the deleted segment's end around.
    delete nextSegmentStartFloorRef.current[selectedEpisodeId]
  }

  const [syncing, setSyncing] = useState(false)
  // Set when playback should auto-pause on reaching a specific canto time (e.g. reviewing a single
  // marked segment via its "Play" button) — null means play freely with no stop point. Passing a
  // value here vs. omitting it is how each call site opts in or out, rather than a separate flag.
  const [stopAtCantoTime, setStopAtCantoTime] = useState<number | null>(null)

  // 1.25x makes marking sessions faster to get through without making the dialogue hard to
  // follow — reset to normal speed once synced playback stops so it doesn't leak into anything
  // else (e.g. a plain video played outside this flow).
  const MARKING_PLAYBACK_RATE = 1.25

  function startSyncedPlayback(stopAt?: number) {
    if (!episode || !anchorsSet) return
    cantoPlayerRef.current?.setPlaybackRate?.(MARKING_PLAYBACK_RATE)
    englishPlayerRef.current?.setPlaybackRate?.(MARKING_PLAYBACK_RATE)
    cantoPlayerRef.current?.playVideo()
    englishPlayerRef.current?.playVideo()
    setStopAtCantoTime(stopAt ?? null)
    setSyncing(true)
  }

  function stopSyncedPlayback() {
    cantoPlayerRef.current?.pauseVideo()
    englishPlayerRef.current?.pauseVideo()
    cantoPlayerRef.current?.setPlaybackRate?.(1)
    englishPlayerRef.current?.setPlaybackRate?.(1)
    setSyncing(false)
  }

  function goToContentStart() {
    if (!episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    cantoPlayerRef.current?.seekTo(anchors.cantoContentStart, true)
    englishPlayerRef.current?.seekTo(anchors.englishContentStart, true)
    startSyncedPlayback()
  }

  function playSegment(segment: DubSegment) {
    if (!anchorsSet) return
    cantoPlayerRef.current?.seekTo(segment.cantoStart, true)
    englishPlayerRef.current?.seekTo(segment.englishStart, true)
    startSyncedPlayback(segment.cantoEnd)
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

  // Auto-pauses once playback reaches stopAtCantoTime (set when reviewing a single segment via its
  // "Play" button). Polls faster than the resync interval above — that one only needs to be close
  // enough for eyes/ears, but overshooting here means playing into the next line.
  useEffect(() => {
    if (!syncing || stopAtCantoTime === null) return
    const interval = setInterval(() => {
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      if (cantoTime >= stopAtCantoTime) {
        cantoPlayerRef.current?.pauseVideo()
        englishPlayerRef.current?.pauseVideo()
        cantoPlayerRef.current?.setPlaybackRate?.(1)
        englishPlayerRef.current?.setPlaybackRate?.(1)
        setSyncing(false)
        setStopAtCantoTime(null)
      }
    }, 200)
    return () => clearInterval(interval)
  }, [syncing, stopAtCantoTime])

  // Space bar is the marking key while synced playback is running: hold it down for as long as a
  // character/narrator is speaking, release when they stop. The segment's end is the release
  // time; its start is one second before the press (reaction-time offset), clamped to the
  // same synchronous per-episode floor `nextSegmentStartFloorRef` already tracks, so it can never
  // overlap the previous segment even if the press lands a little early.
  useEffect(() => {
    if (!syncing || !episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    // Captured here, in the scope where `episode` is already narrowed non-null — TypeScript
    // doesn't carry that narrowing into the nested function declarations below, since it can't
    // prove they run synchronously with this check.
    const episodeId = episode.id

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      const floor =
        nextSegmentStartFloorRef.current[episodeId] ??
        (segments.length > 0 ? segments[segments.length - 1].cantoEnd : anchors.cantoContentStart)
      pendingSegmentStartRef.current = Math.max(cantoTime - 1, floor)
    }

    async function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space' || pendingSegmentStartRef.current === null) return
      event.preventDefault()
      const cantoStart = pendingSegmentStartRef.current
      pendingSegmentStartRef.current = null

      const cantoEnd = cantoPlayerRef.current?.getCurrentTime() ?? 0
      if (cantoEnd <= cantoStart) return

      const englishStart = englishTimeFor(cantoStart, anchors)
      const englishEnd = englishTimeFor(cantoEnd, anchors)
      nextSegmentStartFloorRef.current[episodeId] = cantoEnd

      const response = await fetch(`/api/dub-sync/episodes/${episodeId}/segments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cantoStart, cantoEnd, englishStart, englishEnd }),
      })
      if (!response.ok) {
        nextSegmentStartFloorRef.current[episodeId] = cantoStart
        return
      }
      const { segment } = await response.json()
      setSegmentsByEpisode((current) => ({
        ...current,
        [episodeId]: [...(current[episodeId] ?? []), segment],
      }))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [syncing, episode, anchorsSet, segments])

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
                onClick={() => selectEpisode(candidate.id)}
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
            <input
              aria-label="Episode title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              className="text-2xl font-bold mb-4 border rounded p-1 w-full"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div>
                {/* The iframe defaults to a fixed 960px width regardless of its container, which
                    overflowed this grid column and overlapped the other video/sidebar — forced
                    responsive here so it shrinks to fit instead. */}
                <div className="[&_iframe]:w-full [&_iframe]:h-auto [&_iframe]:aspect-video">
                  <YoutubePlayer ref={cantoPlayerRef} videoId={episode.cantoneseVideoId} elementId="canto-player" />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={markCantoStart} className="border p-1 rounded">
                    Mark content start
                  </button>
                  <button onClick={markCantoEnd} className="border p-1 rounded">
                    Mark content end
                  </button>
                </div>
                <AnchorFields
                  start={episode.cantoContentStart}
                  end={episode.cantoContentEnd}
                  onSaveStart={editCantoStart}
                  onSaveEnd={editCantoEnd}
                />
              </div>
              <div>
                <div className="[&_iframe]:w-full [&_iframe]:h-auto [&_iframe]:aspect-video">
                  <YoutubePlayer ref={englishPlayerRef} videoId={episode.englishVideoId} elementId="english-player" />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={markEnglishStart} className="border p-1 rounded">
                    Mark content start
                  </button>
                  <button onClick={markEnglishEnd} className="border p-1 rounded">
                    Mark content end
                  </button>
                </div>
                <AnchorFields
                  start={episode.englishContentStart}
                  end={episode.englishContentEnd}
                  onSaveStart={editEnglishStart}
                  onSaveEnd={editEnglishEnd}
                />
              </div>
            </div>
            {canRefineAlignment && (
              <div className="mb-4">
                <button onClick={runRefineAlignment} disabled={refining} className="border p-2 rounded">
                  {refining ? 'Refining…' : 'Refine precision'}
                </button>
                {refineError && (
                  <p role="alert" className="text-red-600 mt-2">
                    {refineError}
                  </p>
                )}
                {refineSuggestion && (
                  <div className="mt-2 flex items-center gap-2">
                    <div>
                      <p>
                        Suggested English start: {refineSuggestion.suggestedEnglishContentStart.toFixed(2)} (offset{' '}
                        {refineSuggestion.startOffsetSeconds.toFixed(2)}s
                        {refineSuggestion.startConfident ? '' : ', low confidence'})
                      </p>
                      {refineSuggestion.suggestedEnglishContentEnd !== null && (
                        <p>
                          Suggested English end: {refineSuggestion.suggestedEnglishContentEnd.toFixed(2)} (offset{' '}
                          {refineSuggestion.endOffsetSeconds!.toFixed(2)}s
                          {refineSuggestion.endConfident ? '' : ', low confidence'})
                        </p>
                      )}
                    </div>
                    <button onClick={applyRefineSuggestion} className="border p-1 rounded">
                      Apply
                    </button>
                    <button onClick={() => setRefineSuggestion(null)} className="border p-1 rounded">
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}

            {!anchorsSet && <p className="text-gray-500 mb-4">Set anchors before marking segments.</p>}

            <div className="flex gap-2 mb-4">
              <button onClick={runGenerateFromCaptions} disabled={!anchorsSet} className="border p-2 rounded">
                Generate from captions
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => (syncing ? stopSyncedPlayback() : startSyncedPlayback())}
                disabled={!anchorsSet}
                className="border p-2 rounded"
              >
                {syncing ? 'Pause synced' : 'Play synced'}
              </button>
              <button onClick={goToContentStart} disabled={!anchorsSet} className="border p-2 rounded">
                Go to content start
              </button>
            </div>

            {syncing && (
              <p className="text-gray-500 mb-4">Hold SPACE while a character is speaking, release when they stop.</p>
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
              onPlay={playSegment}
            />
          </>
        )}
      </main>
    </div>
  )
}
