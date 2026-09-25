'use client'

import { useEffect, useRef, useState } from 'react'

export interface WaveformRange {
  start: number
  end: number
}

export interface WaveformTrackProps {
  peaks: number[]
  bucketMs: number
  width: number
  height: number
  pixelsPerSecond: number
  viewStartSeconds: number
  onViewStartChange: (viewStartSeconds: number) => void
  markedRanges: WaveformRange[]
  pendingSelection: WaveformRange | null
  onSelectionDrafted: (start: number, end: number) => void
  allowDragSelect: boolean
  color: string
  playheadSeconds: number | null
  checkpointSeconds: number[]
  resyncMode: boolean
  onResyncDrag: (deltaSeconds: number) => void
}

export function WaveformTrack({
  peaks,
  bucketMs,
  width,
  height,
  pixelsPerSecond,
  viewStartSeconds,
  onViewStartChange,
  markedRanges,
  pendingSelection,
  onSelectionDrafted,
  allowDragSelect,
  color,
  playheadSeconds,
  checkpointSeconds,
  resyncMode,
  onResyncDrag,
}: WaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragStartSeconds, setDragStartSeconds] = useState<number | null>(null)
  const [dragCurrentSeconds, setDragCurrentSeconds] = useState<number | null>(null)
  const [resyncDragging, setResyncDragging] = useState(false)
  const resyncLastClientXRef = useRef(0)

  function secondsAtClientX(clientX: number): number {
    const rect = canvasRef.current!.getBoundingClientRect()
    return viewStartSeconds + (clientX - rect.left) / pixelsPerSecond
  }

  // A whole visible window's worth of seconds, times a fraction, so each button press moves a
  // consistent proportion of what's on screen regardless of the current zoom level.
  const panStepSeconds = (width / pixelsPerSecond) * 0.2

  function rangeToPixels(range: WaveformRange): { x1: number; x2: number } {
    return {
      x1: (range.start - viewStartSeconds) * pixelsPerSecond,
      x2: (range.end - viewStartSeconds) * pixelsPerSecond,
    }
  }

  // Draws on every prop/drag-state change. Canvas is redrawn from scratch each time rather than
  // incrementally patched — simplest correct approach, and cheap enough at this data size/update
  // frequency (an admin tool, not a real-time animation).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = color
    const samplesPerSecond = 1000 / bucketMs
    const startBucket = Math.max(0, Math.floor(viewStartSeconds * samplesPerSecond))
    const endBucket = Math.min(peaks.length, Math.ceil((viewStartSeconds + width / pixelsPerSecond) * samplesPerSecond))
    for (let i = startBucket; i < endBucket; i++) {
      const x = (i / samplesPerSecond - viewStartSeconds) * pixelsPerSecond
      const barHeight = Math.max(1, peaks[i] * height)
      ctx.fillRect(x, (height - barHeight) / 2, Math.max(1, pixelsPerSecond / samplesPerSecond - 1), barHeight)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    for (const range of markedRanges) {
      const { x1, x2 } = rangeToPixels(range)
      ctx.fillRect(x1, 0, x2 - x1, height)
    }

    if (pendingSelection) {
      const { x1, x2 } = rangeToPixels(pendingSelection)
      ctx.fillStyle = 'rgba(45,108,223,0.35)'
      ctx.fillRect(x1, 0, x2 - x1, height)
    }

    if (dragStartSeconds !== null && dragCurrentSeconds !== null) {
      const lo = Math.min(dragStartSeconds, dragCurrentSeconds)
      const hi = Math.max(dragStartSeconds, dragCurrentSeconds)
      const { x1, x2 } = rangeToPixels({ start: lo, end: hi })
      ctx.fillStyle = 'rgba(45,108,223,0.25)'
      ctx.fillRect(x1, 0, x2 - x1, height)
    }

    // Existing resync checkpoints, so a correction made here can be seen relative to the
    // boundaries it will actually apply within (englishTimeFor uses the most recent checkpoint
    // at or before a given time, so each one marks where the next section's constant offset
    // takes over).
    ctx.strokeStyle = '#a855f7'
    ctx.fillStyle = '#a855f7'
    ctx.lineWidth = 1
    ctx.font = '10px sans-serif'
    for (const checkpoint of checkpointSeconds) {
      const x = (checkpoint - viewStartSeconds) * pixelsPerSecond
      if (x < 0 || x > width) continue
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.fillText(`${checkpoint.toFixed(1)}s`, x + 2, 10)
    }

    if (playheadSeconds !== null) {
      const x = (playheadSeconds - viewStartSeconds) * pixelsPerSecond
      if (x >= 0 && x <= width) {
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rangeToPixels closes over props already listed below
  }, [
    peaks,
    bucketMs,
    width,
    height,
    pixelsPerSecond,
    viewStartSeconds,
    markedRanges,
    pendingSelection,
    dragStartSeconds,
    dragCurrentSeconds,
    color,
    playheadSeconds,
    checkpointSeconds,
  ])

  useEffect(() => {
    if (dragStartSeconds === null) return

    function handleMove(event: MouseEvent) {
      setDragCurrentSeconds(secondsAtClientX(event.clientX))
    }
    function handleUp() {
      if (
        dragStartSeconds !== null &&
        dragCurrentSeconds !== null &&
        Math.abs(dragCurrentSeconds - dragStartSeconds) > 0.02
      ) {
        onSelectionDrafted(Math.min(dragStartSeconds, dragCurrentSeconds), Math.max(dragStartSeconds, dragCurrentSeconds))
      }
      setDragStartSeconds(null)
      setDragCurrentSeconds(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- secondsAtClientX closes over viewStartSeconds/pixelsPerSecond
  }, [dragStartSeconds, dragCurrentSeconds, onSelectionDrafted])

  // Resync mode replaces the normal select-drag with "grab and slide the waveform": each pixel
  // of mouse movement nudges the underlying player by the equivalent seconds, in the opposite
  // direction — dragging right brings earlier audio under the fixed reference point, which means
  // seeking backward. The view itself isn't touched here; WaveformMarking keeps it centered on
  // the live (now-changing) playback time as this fires, so the waveform visually slides under a
  // playhead that stays put.
  useEffect(() => {
    if (!resyncDragging) return
    function handleMove(event: MouseEvent) {
      const deltaPixels = event.clientX - resyncLastClientXRef.current
      resyncLastClientXRef.current = event.clientX
      onResyncDrag(-deltaPixels / pixelsPerSecond)
    }
    function handleUp() {
      setResyncDragging(false)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resyncDragging, pixelsPerSecond, onResyncDrag])

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onViewStartChange(Math.max(0, viewStartSeconds - panStepSeconds))}
        className="border p-1 rounded shrink-0"
        title="Scroll the waveform left"
      >
        ◀
      </button>
      {/* self-start + shrink-0: without them this canvas, as a flex-column child, gets stretched
          to the container's width by the default align-items: stretch — leaving its 800x90
          drawing buffer rendered into a visibly larger box, which throws off every click's
          computed time by exactly that stretch ratio. */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="self-start shrink-0"
        onMouseDown={(event) => {
          if (resyncMode) {
            resyncLastClientXRef.current = event.clientX
            setResyncDragging(true)
            return
          }
          if (!allowDragSelect) return
          const seconds = secondsAtClientX(event.clientX)
          setDragStartSeconds(seconds)
          setDragCurrentSeconds(seconds)
        }}
      />
      <button
        onClick={() => onViewStartChange(viewStartSeconds + panStepSeconds)}
        className="border p-1 rounded shrink-0"
        title="Scroll the waveform right"
      >
        ▶
      </button>
    </div>
  )
}
