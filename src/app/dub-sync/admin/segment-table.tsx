'use client'

import { useState } from 'react'
import type { DubSegment, UpdateSegmentInput } from '@/lib/db/dub-sync'

export interface SegmentTableProps {
  episodeId: string
  segments: DubSegment[]
  onUpdate: (segment: DubSegment) => void
  onDelete: (segmentId: string) => void
}

export function SegmentTable({ episodeId, segments, onUpdate, onDelete }: SegmentTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">Label</th>
          <th className="text-left">Canto start</th>
          <th className="text-left">Canto end</th>
          <th className="text-left">English start</th>
          <th className="text-left">English end</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {segments.map((segment) => (
          <SegmentRow
            key={segment.id}
            episodeId={episodeId}
            segment={segment}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  )
}

interface SegmentRowProps {
  episodeId: string
  segment: DubSegment
  onUpdate: (segment: DubSegment) => void
  onDelete: (segmentId: string) => void
}

function SegmentRow({ episodeId, segment, onUpdate, onDelete }: SegmentRowProps) {
  const [draft, setDraft] = useState(segment)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Resets draft when the segment prop changes (e.g. a successful save on another field returns
  // a fresh object from the parent). Comparing and setting state during render — rather than in
  // a useEffect — is React's recommended pattern for "adjusting state when a prop changes"; it
  // runs at most once per differing segment reference, not on every render.
  const [previousSegment, setPreviousSegment] = useState(segment)
  if (segment !== previousSegment) {
    setPreviousSegment(segment)
    setDraft(segment)
  }

  async function saveField<K extends keyof UpdateSegmentInput>(field: K) {
    if (draft[field] === segment[field]) return
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/segments/${segment.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: draft[field] }),
    })
    if (response.ok) {
      setSaveError(null)
      const { segment: updated } = await response.json()
      onUpdate(updated)
    } else {
      // Deliberately don't reset draft to the last-saved value here — the typed value stays
      // visible so the edit isn't lost, and the error makes clear it wasn't saved.
      setSaveError('Failed to save — try again')
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/segments/${segment.id}`, { method: 'DELETE' })
    if (response.ok) onDelete(segment.id)
  }

  return (
    <tr>
      <td>
        <input
          value={draft.label ?? ''}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          onBlur={() => saveField('label')}
          className="border p-1 rounded w-full"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.cantoStart}
          onChange={(e) => setDraft({ ...draft, cantoStart: Number(e.target.value) })}
          onBlur={() => saveField('cantoStart')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.cantoEnd}
          onChange={(e) => setDraft({ ...draft, cantoEnd: Number(e.target.value) })}
          onBlur={() => saveField('cantoEnd')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.englishStart}
          onChange={(e) => setDraft({ ...draft, englishStart: Number(e.target.value) })}
          onBlur={() => saveField('englishStart')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.englishEnd}
          onChange={(e) => setDraft({ ...draft, englishEnd: Number(e.target.value) })}
          onBlur={() => saveField('englishEnd')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <button onClick={handleDelete} className="border p-1 rounded text-sm">
          Delete
        </button>
        {saveError && (
          <p role="alert" className="text-red-600 text-xs mt-1">
            {saveError}
          </p>
        )}
      </td>
    </tr>
  )
}
