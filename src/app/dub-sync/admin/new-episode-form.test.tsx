import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewEpisodeForm } from './new-episode-form'

describe('NewEpisodeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            episode: {
              id: 'ep-1',
              title: 'Muddy Puddles',
              cantoneseVideoId: 'canto-123',
              englishVideoId: 'eng-456',
              cantoContentStart: null,
              cantoContentEnd: null,
              englishContentStart: null,
              englishContentEnd: null,
            },
          }),
      })
    )
  })

  it('submits the form and reports the new episode to its caller', async () => {
    const onCreated = vi.fn()
    render(<NewEpisodeForm onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Muddy Puddles' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'canto-123' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'eng-456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'ep-1' })))
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/episodes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Muddy Puddles', cantoneseVideoId: 'canto-123', englishVideoId: 'eng-456' }),
      })
    )
  })

  it('shows an error message when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<NewEpisodeForm onCreated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'a' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to create episode'))
  })
})
