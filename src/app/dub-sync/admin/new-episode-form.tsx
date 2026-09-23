'use client'

import { useState, type FormEvent } from 'react'
import type { DubEpisode } from '@/lib/db/dub-sync'

interface NewEpisodeFormProps {
  onCreated: (episode: DubEpisode) => void
}

export function NewEpisodeForm({ onCreated }: NewEpisodeFormProps) {
  const [title, setTitle] = useState('')
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false)
  const [cantoneseVideoId, setCantoneseVideoId] = useState('')
  const [englishVideoId, setEnglishVideoId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleTitleChange(value: string) {
    setTitle(value)
    setTitleManuallyEdited(true)
  }

  // Defaults the title to the English video's own title — the Cantonese video ID isn't used for
  // this, since its title is usually just the Cantonese title with romanization/captions notes
  // that aren't useful as the episode's display title.
  async function handleEnglishVideoIdBlur() {
    if (!englishVideoId) return
    const response = await fetch(`/api/dub-sync/youtube-title?videoId=${encodeURIComponent(englishVideoId)}`)
    if (!response.ok) return
    const { title: fetchedTitle } = await response.json()
    if (!titleManuallyEdited) setTitle(fetchedTitle)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const response = await fetch('/api/dub-sync/episodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, cantoneseVideoId, englishVideoId }),
    })

    setSubmitting(false)
    if (!response.ok) {
      setError('Failed to create episode')
      return
    }
    const { episode } = await response.json()
    setTitle('')
    setTitleManuallyEdited(false)
    setCantoneseVideoId('')
    setEnglishVideoId('')
    onCreated(episode)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 max-w-md" data-testid="new-episode-form">
      <label className="flex flex-col gap-1">
        Title
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          required
          className="border p-2 rounded"
        />
      </label>
      <label className="flex flex-col gap-1">
        Cantonese video ID
        <input
          value={cantoneseVideoId}
          onChange={(e) => setCantoneseVideoId(e.target.value)}
          required
          className="border p-2 rounded"
        />
      </label>
      <label className="flex flex-col gap-1">
        English video ID
        <input
          value={englishVideoId}
          onChange={(e) => setEnglishVideoId(e.target.value)}
          onBlur={handleEnglishVideoIdBlur}
          required
          className="border p-2 rounded"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className="border p-2 rounded bg-gray-800 text-white">
        {submitting ? 'Adding…' : 'Add episode'}
      </button>
    </form>
  )
}
