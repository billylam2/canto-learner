'use client'

import { useState } from 'react'
import type { DubResyncCheckpoint } from '@/lib/db/dub-sync'

export interface CheckpointTableProps {
  episodeId: string
  checkpoints: DubResyncCheckpoint[]
  onUpdate: (checkpoint: DubResyncCheckpoint) => void
  onDelete: (checkpointId: string) => void
}

export function CheckpointTable({ episodeId, checkpoints, onUpdate, onDelete }: CheckpointTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">Canto time</th>
          <th className="text-left">English time</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {checkpoints.map((checkpoint) => (
          <CheckpointRow
            key={checkpoint.id}
            episodeId={episodeId}
            checkpoint={checkpoint}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  )
}

interface CheckpointRowProps {
  episodeId: string
  checkpoint: DubResyncCheckpoint
  onUpdate: (checkpoint: DubResyncCheckpoint) => void
  onDelete: (checkpointId: string) => void
}

function CheckpointRow({ episodeId, checkpoint, onUpdate, onDelete }: CheckpointRowProps) {
  const [draft, setDraft] = useState(checkpoint)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previousCheckpoint, setPreviousCheckpoint] = useState(checkpoint)
  if (checkpoint !== previousCheckpoint) {
    setPreviousCheckpoint(checkpoint)
    setDraft(checkpoint)
  }

  async function saveField(field: 'cantoTime' | 'englishTime') {
    if (draft[field] === checkpoint[field]) return
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/checkpoints/${checkpoint.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: draft[field] }),
    })
    const body = await response.json()
    if (response.ok) {
      setSaveError(null)
      onUpdate(body.checkpoint)
    } else {
      // Deliberately don't reset draft to the last-saved value here — the typed value stays
      // visible so the edit isn't lost, and the error makes clear it wasn't saved.
      setSaveError(body.error ?? 'Failed to save — try again')
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/checkpoints/${checkpoint.id}`, {
      method: 'DELETE',
    })
    if (response.ok) onDelete(checkpoint.id)
  }

  return (
    <tr>
      <td>
        <input
          type="number"
          value={draft.cantoTime}
          onChange={(e) => setDraft({ ...draft, cantoTime: Number(e.target.value) })}
          onBlur={() => saveField('cantoTime')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.englishTime}
          onChange={(e) => setDraft({ ...draft, englishTime: Number(e.target.value) })}
          onBlur={() => saveField('englishTime')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <button onClick={handleDelete} className="border p-1 rounded text-sm" title="Delete this checkpoint">
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
