'use client'

import { useEffect, useState } from 'react'
import { WaveformTrack, type WaveformRange } from './waveform-track'
import { englishTimeFor, type EpisodeAnchors, type ResyncCheckpoint } from '@/lib/dub-sync/normalize'
import type { DubSegment } from '@/lib/db/dub-sync'

const TRACK_WIDTH = 800
const TRACK_HEIGHT = 90
const BUCKET_MS = 50
const DEFAULT_PIXELS_PER_SECOND = 60
const MIN_PIXELS_PER_SECOND = 10
const MAX_PIXELS_PER_SECOND = 400
const CANTO_COLOR = '#4ade80'
const ENGLISH_COLOR = '#60a5fa'

export interface WaveformMarkingProps {
  episodeId: string
  cantoPeaks: number[]
  englishPeaks: number[]
  anchors: EpisodeAnchors
  checkpoints: ResyncCheckpoint[]
  segments: DubSegment[]
  onSegmentCreated: (segment: DubSegment) => void
  isPlaying?: boolean
  cantoTimeSeconds?: number
  englishTimeSeconds?: number
}

function noop() {}

export function WaveformMarking({
  episodeId,
  cantoPeaks,
  englishPeaks,
  anchors,
  checkpoints,
  segments,
  onSegmentCreated,
  isPlaying = false,
  cantoTimeSeconds = 0,
  englishTimeSeconds = 0,
}: WaveformMarkingProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND)
  const [cantoViewStart, setCantoViewStart] = useState(0)
  const [englishViewStart, setEnglishViewStart] = useState(0)
  // A drag on the Cantonese track alone defines the whole segment — its matching English range is
  // derived below via englishTimeFor, never dragged independently. There's no inverse of that
  // mapping to go the other way, and a single drag is also just simpler to use.
  const [pendingRange, setPendingRange] = useState<WaveformRange | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  let englishPendingRange: WaveformRange | null = null
  if (pendingRange) {
    try {
      englishPendingRange = {
        start: englishTimeFor(pendingRange.start, anchors, checkpoints),
        end: englishTimeFor(pendingRange.end, anchors, checkpoints),
      }
    } catch {
      // Anchors momentarily invalid (e.g. mid-edit) — leave it unset; Confirm stays disabled.
    }
  }

  // Re-centers the English view on englishTimeFor(cantoViewCenter) whenever the Cantonese view
  // moves — a navigation aid only, never a saved value. Deliberately excludes englishViewStart
  // from its own dependencies, so a manual scroll on the English track (which also calls
  // setEnglishViewStart, via WaveformTrack's onViewStartChange) isn't immediately overwritten —
  // it only re-syncs the next time the Cantonese view itself changes. Skipped entirely while
  // playing, since the playback-following effect below drives both views directly from live
  // player position instead (this derived-from-Cantonese estimate would otherwise fight it).
  useEffect(() => {
    if (isPlaying) return
    const cantoViewCenter = cantoViewStart + TRACK_WIDTH / pixelsPerSecond / 2
    try {
      const englishCenter = englishTimeFor(cantoViewCenter, anchors, checkpoints)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- englishViewStart is genuinely stateful, not purely derived: it's independently settable via a manual English-track pan (see the effect's own comment above), so it can't be computed inline during render.
      setEnglishViewStart(Math.max(0, englishCenter - TRACK_WIDTH / pixelsPerSecond / 2))
    } catch {
      // Anchors momentarily invalid (e.g. mid-edit) — leave the English view where it is, same
      // defensive handling as computeResyncTarget.
    }
  }, [cantoViewStart, pixelsPerSecond, anchors, checkpoints, isPlaying])

  // While playing, keeps both waveforms scrolled so the live playhead line stays roughly
  // centered — otherwise it runs off the visible ~13-second window within a few seconds of
  // playback and the marking aid this is meant to provide is lost.
  useEffect(() => {
    if (!isPlaying) return
    const halfWindowSeconds = TRACK_WIDTH / pixelsPerSecond / 2
    // eslint-disable-next-line react-hooks/set-state-in-effect -- view position tracks the parent's live-polled player time, which can't be computed during render.
    setCantoViewStart(Math.max(0, cantoTimeSeconds - halfWindowSeconds))
    setEnglishViewStart(Math.max(0, englishTimeSeconds - halfWindowSeconds))
  }, [isPlaying, cantoTimeSeconds, englishTimeSeconds, pixelsPerSecond])

  const cantoMarkedRanges: WaveformRange[] = segments.map((s) => ({ start: s.cantoStart, end: s.cantoEnd }))
  const englishMarkedRanges: WaveformRange[] = segments.map((s) => ({ start: s.englishStart, end: s.englishEnd }))

  async function confirmSegment() {
    if (!pendingRange || !englishPendingRange) return
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/segments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cantoStart: pendingRange.start,
        cantoEnd: pendingRange.end,
        englishStart: englishPendingRange.start,
        englishEnd: englishPendingRange.end,
      }),
    })
    if (!response.ok) {
      setConfirmError('Failed to save segment')
      return
    }
    const { segment } = await response.json()
    onSegmentCreated(segment)
    setPendingRange(null)
    setConfirmError(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <button
          onClick={() => setPixelsPerSecond((p) => Math.max(MIN_PIXELS_PER_SECOND, p / 1.5))}
          className="border p-1 rounded"
          title="Zoom out"
        >
          -
        </button>
        <button
          onClick={() => setPixelsPerSecond((p) => Math.min(MAX_PIXELS_PER_SECOND, p * 1.5))}
          className="border p-1 rounded"
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="text-xs text-gray-500">Cantonese</div>
      <WaveformTrack
        peaks={cantoPeaks}
        bucketMs={BUCKET_MS}
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
        pixelsPerSecond={pixelsPerSecond}
        viewStartSeconds={cantoViewStart}
        onViewStartChange={setCantoViewStart}
        markedRanges={cantoMarkedRanges}
        pendingSelection={pendingRange}
        onSelectionDrafted={(start, end) => setPendingRange({ start, end })}
        allowDragSelect={true}
        color={CANTO_COLOR}
        playheadSeconds={cantoTimeSeconds}
      />

      <div className="text-xs text-gray-500 mt-2">English</div>
      <WaveformTrack
        peaks={englishPeaks}
        bucketMs={BUCKET_MS}
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
        pixelsPerSecond={pixelsPerSecond}
        viewStartSeconds={englishViewStart}
        onViewStartChange={setEnglishViewStart}
        markedRanges={englishMarkedRanges}
        pendingSelection={englishPendingRange}
        onSelectionDrafted={noop}
        allowDragSelect={false}
        color={ENGLISH_COLOR}
        playheadSeconds={englishTimeSeconds}
      />

      {pendingRange && (
        <div className="flex gap-2 items-center">
          <button onClick={() => setPendingRange(null)} className="border p-1 rounded" title="Discard this selection">
            Cancel selection
          </button>
          <span className="text-xs text-gray-500">
            Canto {pendingRange.start.toFixed(2)}s – {pendingRange.end.toFixed(2)}s
            {englishPendingRange && (
              <>
                {' '}
                · English {englishPendingRange.start.toFixed(2)}s – {englishPendingRange.end.toFixed(2)}s
              </>
            )}
          </span>
        </div>
      )}

      <button
        onClick={confirmSegment}
        disabled={!pendingRange || !englishPendingRange}
        className="border p-2 rounded self-start"
        title="Save this range as a segment on both dubs"
      >
        Confirm segment
      </button>
      {confirmError && (
        <p role="alert" className="text-red-600">
          {confirmError}
        </p>
      )}
    </div>
  )
}
