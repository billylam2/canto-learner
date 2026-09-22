'use client'

import { useState } from 'react'

export interface AnchorFieldsProps {
  start: number | null
  end: number | null
  onSaveStart: (value: number) => void
  onSaveEnd: (value: number) => void
}

export function AnchorFields({ start, end, onSaveStart, onSaveEnd }: AnchorFieldsProps) {
  const [draftStart, setDraftStart] = useState(start ?? 0)
  const [draftEnd, setDraftEnd] = useState(end ?? 0)

  // Resets the draft when the start/end props change externally (e.g. "Mark content start" was
  // clicked instead of typed) — see segment-table.tsx's SegmentRow for the same pattern.
  const [previousStart, setPreviousStart] = useState(start)
  const [previousEnd, setPreviousEnd] = useState(end)
  if (start !== previousStart) {
    setPreviousStart(start)
    setDraftStart(start ?? 0)
  }
  if (end !== previousEnd) {
    setPreviousEnd(end)
    setDraftEnd(end ?? 0)
  }

  return (
    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
      <label>
        Start
        <input
          aria-label="Start"
          type="number"
          value={draftStart}
          onChange={(e) => setDraftStart(Number(e.target.value))}
          onBlur={() => {
            if (draftStart !== start) onSaveStart(draftStart)
          }}
          className="border p-1 rounded w-20 ml-1"
        />
      </label>
      ·
      <label>
        End
        <input
          aria-label="End"
          type="number"
          value={draftEnd}
          onChange={(e) => setDraftEnd(Number(e.target.value))}
          onBlur={() => {
            if (draftEnd !== end) onSaveEnd(draftEnd)
          }}
          className="border p-1 rounded w-20 ml-1"
        />
      </label>
    </p>
  )
}
