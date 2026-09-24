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
  color: string
  playheadSeconds: number | null
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
  color,
  playheadSeconds,
}: WaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragStartSeconds, setDragStartSeconds] = useState<number | null>(null)
  const [dragCurrentSeconds, setDragCurrentSeconds] = useState<number | null>(null)

  function secondsAtClientX(clientX: number): number {
    const rect = canvasRef.current!.getBoundingClientRect()
    return viewStartSeconds + (clientX - rect.left) / pixelsPerSecond
  }

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

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={(event) => {
        const seconds = secondsAtClientX(event.clientX)
        setDragStartSeconds(seconds)
        setDragCurrentSeconds(seconds)
      }}
      onWheel={(event) => {
        event.preventDefault()
        const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY
        onViewStartChange(Math.max(0, viewStartSeconds + delta / pixelsPerSecond))
      }}
    />
  )
}
