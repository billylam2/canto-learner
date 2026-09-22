'use client'

import { useState, type FormEvent } from 'react'
import type { DubEpisode } from '@/lib/db/dub-sync'

interface NewEpisodeFormProps {
  onCreated: (episode: DubEpisode) => void
}

function combineTitles(cantoTitle: string | null, englishTitle: string | null): string {
  if (cantoTitle && englishTitle) return `${cantoTitle} / ${englishTitle}`
  return cantoTitle ?? englishTitle ?? ''
}

export function NewEpisodeForm({ onCreated }: NewEpisodeFormProps) {
  const [title, setTitle] = useState('')
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false)
  const [cantoneseVideoId, setCantoneseVideoId] = useState('')
  const [englishVideoId, setEnglishVideoId] = useState('')
  const [cantoTitle, setCantoTitle] = useState<string | null>(null)
  const [englishTitle, setEnglishTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function fetchAndApplyTitle(videoId: string, apply: (fetchedTitle: string) => void) {
    if (!videoId) return
    const response = await fetch(`/api/dub-sync/youtube-title?videoId=${encodeURIComponent(videoId)}`)
    if (!response.ok) return
    const { title: fetchedTitle } = await response.json()
    apply(fetchedTitle)
  }

  function handleTitleChange(value: string) {
    setTitle(value)
    setTitleManuallyEdited(true)
  }

  async function handleCantoneseVideoIdBlur() {
    await fetchAndApplyTitle(cantoneseVideoId, (fetchedTitle) => {
      setCantoTitle(fetchedTitle)
      if (!titleManuallyEdited) setTitle(combineTitles(fetchedTitle, englishTitle))
    })
  }

  async function handleEnglishVideoIdBlur() {
    await fetchAndApplyTitle(englishVideoId, (fetchedTitle) => {
      setEnglishTitle(fetchedTitle)
      if (!titleManuallyEdited) setTitle(combineTitles(cantoTitle, fetchedTitle))
    })
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
    setCantoTitle(null)
    setEnglishTitle(null)
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
          onBlur={handleCantoneseVideoIdBlur}
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
