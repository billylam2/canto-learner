'use client'

import { useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors } from '@/lib/dub-sync/normalize'

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

  const [pendingSegment, setPendingSegment] = useState<{
    cantoStart: number
    cantoEnd: number | null
    englishStart: number
    englishEnd: number | null
  } | null>(null)

  function markSegmentStart() {
    if (!anchorsSet) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishStart = englishTimeFor(time, episode as DubEpisode & EpisodeAnchors)
    setPendingSegment({ cantoStart: time, cantoEnd: null, englishStart, englishEnd: null })
    englishPlayerRef.current?.seekTo(englishStart, true)
  }

  function markSegmentEnd() {
    if (!pendingSegment || !anchorsSet) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishEnd = englishTimeFor(time, episode as DubEpisode & EpisodeAnchors)
    setPendingSegment({ ...pendingSegment, cantoEnd: time, englishEnd })
    englishPlayerRef.current?.seekTo(englishEnd, true)
  }

  async function saveSegment() {
    if (!pendingSegment || pendingSegment.cantoEnd === null || pendingSegment.englishEnd === null) return
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
      setSegments((current) => [...current, segment])
      setPendingSegment(null)
    }
  }

  async function deleteSegmentRow(segmentId: string) {
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments/${segmentId}`, { method: 'DELETE' })
    if (response.ok) {
      setSegments((current) => current.filter((segment) => segment.id !== segmentId))
    }
  }

  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{
    cantoStart: number
    cantoEnd: number
    englishStart: number
    englishEnd: number
  } | null>(null)

  function startEditingSegment(segment: DubSegment) {
    setEditingSegmentId(segment.id)
    setEditDraft({
      cantoStart: segment.cantoStart,
      cantoEnd: segment.cantoEnd,
      englishStart: segment.englishStart,
      englishEnd: segment.englishEnd,
    })
  }

  function cancelEditingSegment() {
    setEditingSegmentId(null)
    setEditDraft(null)
  }

  async function saveSegmentEdit(segment: DubSegment) {
    if (!editDraft) return
    const patch: Record<string, number> = {}
    if (editDraft.cantoStart !== segment.cantoStart) patch.cantoStart = editDraft.cantoStart
    if (editDraft.cantoEnd !== segment.cantoEnd) patch.cantoEnd = editDraft.cantoEnd
    if (editDraft.englishStart !== segment.englishStart) patch.englishStart = editDraft.englishStart
    if (editDraft.englishEnd !== segment.englishEnd) patch.englishEnd = editDraft.englishEnd

    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments/${segment.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (response.ok) {
      const { segment: updated } = await response.json()
      setSegments((current) => current.map((existing) => (existing.id === updated.id ? updated : existing)))
      cancelEditingSegment()
    }
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
        <button onClick={markSegmentStart} disabled={!anchorsSet} className="border p-2 rounded">
          Mark start
        </button>
        <button onClick={markSegmentEnd} disabled={!anchorsSet || !pendingSegment} className="border p-2 rounded">
          Mark end
        </button>
        <button
          onClick={saveSegment}
          disabled={!pendingSegment || pendingSegment.cantoEnd === null}
          className="border p-2 rounded"
        >
          Save segment
        </button>
        <button disabled={!anchorsSet} className="border p-2 rounded">
          Generate from captions
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {segments.map((segment) =>
          editingSegmentId === segment.id && editDraft ? (
            <li key={segment.id} className="flex flex-wrap items-center gap-2">
              <label className="flex flex-col text-sm">
                Cantonese start
                <input
                  type="number"
                  value={editDraft.cantoStart}
                  onChange={(e) => setEditDraft({ ...editDraft, cantoStart: Number(e.target.value) })}
                  className="border p-1 rounded w-20"
                />
              </label>
              <label className="flex flex-col text-sm">
                Cantonese end
                <input
                  type="number"
                  value={editDraft.cantoEnd}
                  onChange={(e) => setEditDraft({ ...editDraft, cantoEnd: Number(e.target.value) })}
                  className="border p-1 rounded w-20"
                />
              </label>
              <label className="flex flex-col text-sm">
                English start
                <input
                  type="number"
                  value={editDraft.englishStart}
                  onChange={(e) => setEditDraft({ ...editDraft, englishStart: Number(e.target.value) })}
                  className="border p-1 rounded w-20"
                />
              </label>
              <label className="flex flex-col text-sm">
                English end
                <input
                  type="number"
                  value={editDraft.englishEnd}
                  onChange={(e) => setEditDraft({ ...editDraft, englishEnd: Number(e.target.value) })}
                  className="border p-1 rounded w-20"
                />
              </label>
              <button onClick={() => saveSegmentEdit(segment)} className="border p-1 rounded text-sm">
                Save changes
              </button>
              <button onClick={cancelEditingSegment} className="border p-1 rounded text-sm">
                Cancel
              </button>
            </li>
          ) : (
            <li key={segment.id} className="flex items-center gap-2">
              <span>
                {segment.label ?? `Segment ${segment.position + 1}`} — {segment.cantoStart}s–{segment.cantoEnd}s
              </span>
              <button onClick={() => startEditingSegment(segment)} className="border p-1 rounded text-sm">
                Edit
              </button>
              <button onClick={() => deleteSegmentRow(segment.id)} className="border p-1 rounded text-sm">
                Delete
              </button>
            </li>
          )
        )}
      </ul>
    </main>
  )
}
