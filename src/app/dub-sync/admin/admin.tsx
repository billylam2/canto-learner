'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment, DubResyncCheckpoint, DubWaveform } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors, type ResyncCheckpoint } from '@/lib/dub-sync/normalize'
import { computeResyncTarget } from '@/lib/dub-sync/synced-playback'
import { SegmentPlaybackController } from '@/lib/dub-sync/player-controller'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'
import { CheckpointTable } from './checkpoint-table'
import { WaveformMarking } from './waveform-marking'
import { AnchorFields } from './anchor-fields'

interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
  checkpointsByEpisode?: Record<string, DubResyncCheckpoint[]>
  waveformsByEpisode?: Record<string, DubWaveform[]>
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
  checkpointsByEpisode: initialCheckpoints = {},
  waveformsByEpisode: initialWaveforms = {},
}: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [checkpointsByEpisode, setCheckpointsByEpisode] = useState(initialCheckpoints)
  const [waveformsByEpisode, setWaveformsByEpisode] = useState(initialWaveforms)
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
  const checkpoints: ResyncCheckpoint[] = useMemo(
    () => (selectedEpisodeId ? (checkpointsByEpisode[selectedEpisodeId] ?? []) : []),
    [selectedEpisodeId, checkpointsByEpisode]
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

  const [markingMode, setMarkingMode] = useState<'spacebar' | 'waveform'>('spacebar')

  function appendSegment(segment: DubSegment) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: [...(current[selectedEpisodeId] ?? []), segment],
    }))
  }

  const [generatingWaveforms, setGeneratingWaveforms] = useState(false)
  const [waveformsError, setWaveformsError] = useState<string | null>(null)

  async function runGenerateWaveforms() {
    if (!episode) return
    setGeneratingWaveforms(true)
    setWaveformsError(null)
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/waveforms`, { method: 'POST' })
    setGeneratingWaveforms(false)
    const body = await response.json()
    if (!response.ok) {
      setWaveformsError(body.error ?? 'Failed to generate waveforms')
      return
    }
    setWaveformsByEpisode((current) => ({ ...current, [episode.id]: body.waveforms }))
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

  // Same draft/reset pattern as titleDraft above.
  const [cantoVideoIdDraft, setCantoVideoIdDraft] = useState(episode?.cantoneseVideoId ?? '')
  const [englishVideoIdDraft, setEnglishVideoIdDraft] = useState(episode?.englishVideoId ?? '')
  const [previousEpisodeVideoIds, setPreviousEpisodeVideoIds] = useState({
    canto: episode?.cantoneseVideoId ?? '',
    english: episode?.englishVideoId ?? '',
  })
  if (
    (episode?.cantoneseVideoId ?? '') !== previousEpisodeVideoIds.canto ||
    (episode?.englishVideoId ?? '') !== previousEpisodeVideoIds.english
  ) {
    setPreviousEpisodeVideoIds({ canto: episode?.cantoneseVideoId ?? '', english: episode?.englishVideoId ?? '' })
    setCantoVideoIdDraft(episode?.cantoneseVideoId ?? '')
    setEnglishVideoIdDraft(episode?.englishVideoId ?? '')
  }

  async function saveVideoId(field: 'cantoneseVideoId' | 'englishVideoId', value: string) {
    if (!episode || value === episode[field]) return
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (response.ok) {
      const { episode: updated } = await response.json()
      updateEpisodeInPlace(updated)
    }
  }

  function handleEpisodeDeleted(deletedId: string) {
    setEpisodes((current) => current.filter((candidate) => candidate.id !== deletedId))
    setSegmentsByEpisode((current) => {
      const { [deletedId]: _removed, ...rest } = current
      return rest
    })
    setCheckpointsByEpisode((current) => {
      const { [deletedId]: _removed, ...rest } = current
      return rest
    })
    if (selectedEpisodeId === deletedId) {
      const remaining = episodes.filter((candidate) => candidate.id !== deletedId)
      setSelectedEpisodeId(remaining[0]?.id ?? null)
    }
  }

  async function deleteEpisodeClicked(id: string, title: string) {
    if (!window.confirm(`Delete "${title}" and all its marked segments and checkpoints? This cannot be undone.`)) {
      return
    }
    const response = await fetch(`/api/dub-sync/episodes/${id}`, { method: 'DELETE' })
    if (response.ok) handleEpisodeDeleted(id)
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

  function handleCheckpointUpdated(updated: DubResyncCheckpoint) {
    if (!selectedEpisodeId) return
    setCheckpointsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].map((c) => (c.id === updated.id ? updated : c)),
    }))
  }

  function handleCheckpointDeleted(checkpointId: string) {
    if (!selectedEpisodeId) return
    setCheckpointsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].filter((c) => c.id !== checkpointId),
    }))
  }

  const [syncing, setSyncing] = useState(false)

  // 1.25x makes marking sessions faster to get through without making the dialogue hard to
  // follow — reset to normal speed once synced playback stops so it doesn't leak into anything
  // else (e.g. a plain video played outside this flow).
  const MARKING_PLAYBACK_RATE = 1.25

  const controllerRef = useRef<SegmentPlaybackController | null>(null)
  useEffect(() => {
    controllerRef.current = new SegmentPlaybackController(
      (lang) => (lang === 'canto' ? cantoPlayerRef.current! : englishPlayerRef.current!),
      // Both videos are always visible side by side in the admin UI, so there's no visibility
      // swap to make here (unlike the learner-facing player).
      () => {}
    )
  }, [])

  function startSyncedPlayback() {
    if (!episode || !anchorsSet) return
    // Whichever button was clicked to get here (this one, or e.g. a "Mark content start/end"
    // button clicked just before) otherwise keeps browser focus for the rest of the marking
    // session — Space then doubles as "press this still-focused button" on top of marking,
    // which is what was causing the page to jump around once a segment finished recording.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    controllerRef.current?.stop()
    cantoPlayerRef.current?.setPlaybackRate?.(MARKING_PLAYBACK_RATE)
    englishPlayerRef.current?.setPlaybackRate?.(MARKING_PLAYBACK_RATE)
    cantoPlayerRef.current?.playVideo()
    englishPlayerRef.current?.playVideo()
    setSyncing(true)
  }

  function stopSyncedPlayback() {
    controllerRef.current?.stop()
    cantoPlayerRef.current?.pauseVideo()
    englishPlayerRef.current?.pauseVideo()
    cantoPlayerRef.current?.setPlaybackRate?.(1)
    englishPlayerRef.current?.setPlaybackRate?.(1)
    setSyncing(false)
  }

  const [adjustingCheckpoint, setAdjustingCheckpoint] = useState(false)
  const [checkpointError, setCheckpointError] = useState<string | null>(null)

  // Reuses stopSyncedPlayback so entering adjustment gets the same pause + 1x-rate-reset +
  // `syncing: false` behavior for free — which, since both the resync interval and the spacebar
  // listener are already gated on `syncing`, also suspends them without any extra guard here.
  function enterCheckpointAdjustment() {
    if (!syncing) return
    stopSyncedPlayback()
    setCheckpointError(null)
    setAdjustingCheckpoint(true)
  }

  function nudgeEnglish(deltaSeconds: number) {
    const player = englishPlayerRef.current
    if (!player) return
    player.seekTo(player.getCurrentTime() + deltaSeconds, true)
  }

  function previewPlay() {
    cantoPlayerRef.current?.playVideo()
    englishPlayerRef.current?.playVideo()
  }

  function previewPause() {
    cantoPlayerRef.current?.pauseVideo()
    englishPlayerRef.current?.pauseVideo()
  }

  async function confirmCheckpoint() {
    if (!episode) return
    const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishTime = englishPlayerRef.current?.getCurrentTime() ?? 0
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cantoTime, englishTime }),
    })
    const body = await response.json()
    if (!response.ok) {
      setCheckpointError(body.error ?? 'Failed to save checkpoint')
      return
    }
    setCheckpointError(null)
    setCheckpointsByEpisode((current) => ({
      ...current,
      [episode.id]: [...(current[episode.id] ?? []), body.checkpoint].sort(
        (a: ResyncCheckpoint, b: ResyncCheckpoint) => a.cantoTime - b.cantoTime
      ),
    }))
    setAdjustingCheckpoint(false)
  }

  function cancelCheckpointAdjustment() {
    setAdjustingCheckpoint(false)
    setCheckpointError(null)
  }

  function goToContentStart() {
    if (!episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    cantoPlayerRef.current?.seekTo(anchors.cantoContentStart, true)
    englishPlayerRef.current?.seekTo(anchors.englishContentStart, true)
    startSyncedPlayback()
  }

  // Reviewing a marked segment plays it Cantonese-first, then English — sequentially, not the
  // simultaneous side-by-side sync used while marking — so it's decoupled from that entirely
  // (stops it if running, and never touches `syncing`/the resync interval).
  function playSegment(segment: DubSegment) {
    if (!anchorsSet) return
    setSyncing(false)
    // The clicked "Play" button would otherwise keep browser focus even after switching to
    // marking afterward (see the same blur in startSyncedPlayback).
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    cantoPlayerRef.current?.setPlaybackRate?.(1)
    englishPlayerRef.current?.setPlaybackRate?.(1)
    controllerRef.current?.playSegment('canto', { start: segment.cantoStart, end: segment.cantoEnd }, () => {
      controllerRef.current?.playSegment('english', { start: segment.englishStart, end: segment.englishEnd })
    })
  }

  useEffect(() => {
    if (!syncing || !episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    const interval = setInterval(() => {
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      const englishTime = englishPlayerRef.current?.getCurrentTime() ?? 0
      const target = computeResyncTarget(cantoTime, englishTime, anchors, checkpoints)
      if (target !== null) englishPlayerRef.current?.seekTo(target, true)
    }, 1000)
    return () => clearInterval(interval)
  }, [syncing, episode, anchorsSet, checkpoints])

  // Live playback position for the waveform panel's playhead line and its scroll-follow — kept
  // separate from the resync-correction interval above (different concern, and this one needs a
  // much shorter tick to look smooth). Only runs in waveform mode, since spacebar mode never
  // reads it.
  const [waveformCantoTime, setWaveformCantoTime] = useState(0)
  const [waveformEnglishTime, setWaveformEnglishTime] = useState(0)
  useEffect(() => {
    if (!syncing || markingMode !== 'waveform') return
    const interval = setInterval(() => {
      setWaveformCantoTime(cantoPlayerRef.current?.getCurrentTime() ?? 0)
      setWaveformEnglishTime(englishPlayerRef.current?.getCurrentTime() ?? 0)
    }, 100)
    return () => clearInterval(interval)
  }, [syncing, markingMode])

  // Space bar is the marking key while synced playback is running: hold it down for as long as a
  // character/narrator is speaking, release when they stop. The segment's end is the release
  // time; its start is one second before the press (reaction-time offset), clamped to the
  // same synchronous per-episode floor `nextSegmentStartFloorRef` already tracks, so it can never
  // overlap the previous segment even if the press lands a little early. Gated to spacebar mode
  // only — waveform mode has its own click-drag marking, and leaving this listener active there
  // too would let a stray space press during waveform-mode playback silently create a segment.
  useEffect(() => {
    if (!syncing || !episode || !anchorsSet || markingMode !== 'spacebar') return
    const anchors = episode as DubEpisode & EpisodeAnchors
    // Captured here, in the scope where `episode` is already narrowed non-null — TypeScript
    // doesn't carry that narrowing into the nested function declarations below, since it can't
    // prove they run synchronously with this check.
    const episodeId = episode.id

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space') return
      // Must run on every repeat too, not just the first press: the browser's own default for
      // Space (scroll the page down, like Page Down) re-fires on each OS key-repeat event while
      // the key stays held — which is exactly what was walking the page to the bottom during a
      // long hold. Only the marking logic itself skips repeats, below.
      event.preventDefault()
      if (event.repeat) return
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

      const englishStart = englishTimeFor(cantoStart, anchors, checkpoints)
      const englishEnd = englishTimeFor(cantoEnd, anchors, checkpoints)
      if (englishEnd <= englishStart) return
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
      // Belt-and-suspenders against the page jumping when the new row is added: whatever the
      // exact cause turns out to be, forcibly restoring the pre-update scroll position on the
      // next frame guarantees marking a segment never moves the viewport.
      const scrollX = window.scrollX
      const scrollY = window.scrollY
      setSegmentsByEpisode((current) => ({
        ...current,
        [episodeId]: [...(current[episodeId] ?? []), segment],
      }))
      requestAnimationFrame(() => window.scrollTo(scrollX, scrollY))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [syncing, episode, anchorsSet, segments, checkpoints, markingMode])

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
            <li key={candidate.id} className="flex items-center gap-1">
              <button
                onClick={() => selectEpisode(candidate.id)}
                className={`text-left w-full p-1 rounded ${candidate.id === selectedEpisodeId ? 'bg-gray-200' : ''}`}
              >
                {candidate.title}
              </button>
              <button
                onClick={() => deleteEpisodeClicked(candidate.id, candidate.title)}
                className="border p-1 rounded text-xs shrink-0"
                title="Delete this episode and all its segments and checkpoints"
              >
                Delete
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
              <label className="flex flex-col gap-1">
                Edit Cantonese video ID
                <input
                  value={cantoVideoIdDraft}
                  onChange={(e) => setCantoVideoIdDraft(e.target.value)}
                  onBlur={() => saveVideoId('cantoneseVideoId', cantoVideoIdDraft)}
                  className="border p-1 rounded"
                />
              </label>
              <label className="flex flex-col gap-1">
                Edit English video ID
                <input
                  value={englishVideoIdDraft}
                  onChange={(e) => setEnglishVideoIdDraft(e.target.value)}
                  onBlur={() => saveVideoId('englishVideoId', englishVideoIdDraft)}
                  className="border p-1 rounded"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div>
                {/* The iframe defaults to a fixed 960px width regardless of its container, which
                    overflowed this grid column and overlapped the other video/sidebar — forced
                    responsive here so it shrinks to fit instead. */}
                <div className="[&_iframe]:w-full [&_iframe]:h-auto [&_iframe]:aspect-video">
                  <YoutubePlayer ref={cantoPlayerRef} videoId={episode.cantoneseVideoId} elementId="canto-player" />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={markCantoStart}
                    className="border p-1 rounded"
                    title="Set this video's content start to the current playback position"
                  >
                    Mark content start
                  </button>
                  <button
                    onClick={markCantoEnd}
                    className="border p-1 rounded"
                    title="Set this video's content end to the current playback position"
                  >
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
                  <button
                    onClick={markEnglishStart}
                    className="border p-1 rounded"
                    title="Set this video's content start to the current playback position"
                  >
                    Mark content start
                  </button>
                  <button
                    onClick={markEnglishEnd}
                    className="border p-1 rounded"
                    title="Set this video's content end to the current playback position"
                  >
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
                <button
                  onClick={runRefineAlignment}
                  disabled={refining}
                  className="border p-2 rounded"
                  title="Auto-suggest a frame-accurate correction to the English anchors using video similarity"
                >
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
                    <button
                      onClick={applyRefineSuggestion}
                      className="border p-1 rounded"
                      title="Use the suggested English times as the new anchors"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setRefineSuggestion(null)}
                      className="border p-1 rounded"
                      title="Discard the suggestion without applying it"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}

            {!anchorsSet && <p className="text-gray-500 mb-4">Set anchors before marking segments.</p>}

            <div className="flex gap-2 mb-4">
              <button
                onClick={runGenerateFromCaptions}
                disabled={!anchorsSet}
                className="border p-2 rounded"
                title="Create segments automatically from this video's caption timing"
              >
                Generate from captions
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMarkingMode('spacebar')}
                className={`border p-2 rounded ${markingMode === 'spacebar' ? 'bg-gray-800 text-white' : ''}`}
                title="Mark segments by holding SPACE during synced playback"
              >
                Spacebar marking
              </button>
              <button
                onClick={() => setMarkingMode('waveform')}
                disabled={!anchorsSet}
                className={`border p-2 rounded ${markingMode === 'waveform' ? 'bg-gray-800 text-white' : ''}`}
                title="Mark segments by dragging over each dub's audio waveform"
              >
                Waveform marking
              </button>
              <button
                onClick={runGenerateWaveforms}
                disabled={generatingWaveforms}
                className="border p-2 rounded"
                title="Download both videos' audio and compute waveform previews for waveform marking"
              >
                {generatingWaveforms ? 'Generating…' : 'Generate waveforms'}
              </button>
            </div>

            {waveformsError && (
              <p role="alert" className="text-red-600 mb-4">
                {waveformsError}
              </p>
            )}

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => (syncing ? stopSyncedPlayback() : startSyncedPlayback())}
                disabled={!anchorsSet}
                className="border p-2 rounded"
                title="Play both videos together, auto-correcting English position to stay in sync"
              >
                {syncing ? 'Pause synced' : 'Play synced'}
              </button>
              <button
                onClick={goToContentStart}
                disabled={!anchorsSet}
                className="border p-2 rounded"
                title="Jump both videos to their marked content start and begin synced playback"
              >
                Go to content start
              </button>
              <button
                onClick={enterCheckpointAdjustment}
                disabled={!syncing}
                className="border p-2 rounded"
                title="Pause and manually correct the English position to fix drift from here onward"
              >
                Resync checkpoint
              </button>
            </div>

            {markingMode === 'spacebar' && syncing && !adjustingCheckpoint && (
              <p className="text-gray-500 mb-4">Hold SPACE while a character is speaking, release when they stop.</p>
            )}

            {adjustingCheckpoint && (
              <div className="border p-2 rounded mb-4 flex flex-col gap-2">
                <p className="text-gray-500">Nudge the English video to match, then confirm.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => nudgeEnglish(-0.5)}
                    className="border p-1 rounded"
                    title="Shift the English video back by 0.5s"
                  >
                    -0.5s
                  </button>
                  <button
                    onClick={() => nudgeEnglish(-0.1)}
                    className="border p-1 rounded"
                    title="Shift the English video back by 0.1s"
                  >
                    -0.1s
                  </button>
                  <button
                    onClick={() => nudgeEnglish(0.1)}
                    className="border p-1 rounded"
                    title="Shift the English video forward by 0.1s"
                  >
                    +0.1s
                  </button>
                  <button
                    onClick={() => nudgeEnglish(0.5)}
                    className="border p-1 rounded"
                    title="Shift the English video forward by 0.5s"
                  >
                    +0.5s
                  </button>
                  <button
                    onClick={previewPlay}
                    className="border p-1 rounded"
                    title="Play both videos from their current position to check alignment"
                  >
                    Preview play
                  </button>
                  <button onClick={previewPause} className="border p-1 rounded" title="Pause both videos">
                    Preview pause
                  </button>
                  <button
                    onClick={confirmCheckpoint}
                    className="border p-1 rounded"
                    title="Save this correction as a resync checkpoint"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={cancelCheckpointAdjustment}
                    className="border p-1 rounded"
                    title="Discard this correction without saving"
                  >
                    Cancel
                  </button>
                </div>
                {checkpointError && (
                  <p role="alert" className="text-red-600">
                    {checkpointError}
                  </p>
                )}
              </div>
            )}

            {markingMode === 'waveform' && anchorsSet && (
              <WaveformMarking
                key={episode.id}
                episodeId={episode.id}
                cantoPeaks={waveformsByEpisode[episode.id]?.find((w) => w.language === 'canto')?.peaks ?? []}
                englishPeaks={waveformsByEpisode[episode.id]?.find((w) => w.language === 'english')?.peaks ?? []}
                anchors={episode as DubEpisode & EpisodeAnchors}
                checkpoints={checkpoints}
                segments={segments}
                onSegmentCreated={appendSegment}
                isPlaying={syncing}
                cantoTimeSeconds={waveformCantoTime}
                englishTimeSeconds={waveformEnglishTime}
              />
            )}

            {captionsError && (
              <p role="alert" className="text-red-600 mb-4">
                {captionsError}
              </p>
            )}

            <CheckpointTable
              episodeId={episode.id}
              checkpoints={checkpointsByEpisode[episode.id] ?? []}
              onUpdate={handleCheckpointUpdated}
              onDelete={handleCheckpointDeleted}
            />

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
