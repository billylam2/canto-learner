import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

import { Editor } from './editor'
import { YoutubePlayer } from '@/components/dub-sync/youtube-player'

const baseEpisode = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

function mockPlayerHandle(currentTime: number) {
  return { seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getCurrentTime: () => currentTime }
}

describe('Editor anchors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('marks the canto content start from the canto player current time and saves it', async () => {
    let capturedRef: React.Ref<unknown> | undefined
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
      if (elementId === 'canto-player') capturedRef = (props as { ref?: React.Ref<unknown> }).ref
      return <div data-testid={`player-${elementId}`} />
    })

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...baseEpisode, cantoContentStart: 8 } }),
    } as Response)

    render(<Editor episode={baseEpisode} segments={[]} />)

    if (capturedRef && typeof capturedRef === 'object' && 'current' in capturedRef) {
      ;(capturedRef as { current: unknown }).current = mockPlayerHandle(8)
    }

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-1', expect.objectContaining({ method: 'PATCH' }))
    )
  })

  it('disables segment controls until all four anchors are set', () => {
    render(<Editor episode={baseEpisode} segments={[]} />)
    expect(screen.getByRole('button', { name: 'Mark start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate from captions' })).toBeDisabled()
  })

  it('enables segment controls once all four anchors are set', () => {
    render(
      <Editor
        episode={{
          ...baseEpisode,
          cantoContentStart: 8,
          cantoContentEnd: 100,
          englishContentStart: 5,
          englishContentEnd: 95,
        }}
        segments={[]}
      />
    )
    expect(screen.getByRole('button', { name: 'Mark start' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Generate from captions' })).toBeEnabled()
  })
})

describe('Editor manual segment creation', () => {
  const episodeWithAnchors = {
    ...baseEpisode,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId }: { elementId: string }) => (
      <div data-testid={`player-${elementId}`} />
    ))
  })

  it('marks start then end, proposes an english time via normalization, and saves on submit', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-1',
            position: 0,
            label: null,
            cantoStart: 20,
            cantoEnd: 30,
            englishStart: 40,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(<Editor episode={episodeWithAnchors} segments={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark start' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark end' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save segment' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments',
        expect.objectContaining({ method: 'POST' })
      )
    )
    expect(await screen.findByText(/Segment 1/)).toBeInTheDocument()
  })

  it('deletes a segment', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
    render(
      <Editor
        episode={episodeWithAnchors}
        segments={[
          {
            id: 'seg-1',
            episodeId: 'ep-1',
            position: 0,
            label: 'Hello',
            cantoStart: 20,
            cantoEnd: 25,
            englishStart: 40,
            englishEnd: 50,
          },
        ]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments/seg-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    )
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
  })

  it('edits an existing segment boundary and saves it', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-1',
            position: 0,
            label: 'Hello',
            cantoStart: 20,
            cantoEnd: 26.5,
            englishStart: 40,
            englishEnd: 50,
          },
        }),
    } as Response)
    render(
      <Editor
        episode={episodeWithAnchors}
        segments={[
          {
            id: 'seg-1',
            episodeId: 'ep-1',
            position: 0,
            label: 'Hello',
            cantoStart: 20,
            cantoEnd: 25,
            englishStart: 40,
            englishEnd: 50,
          },
        ]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Cantonese end'), { target: { value: '26.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments/seg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cantoEnd: 26.5 }) })
      )
    )
    expect(await screen.findByText(/26\.5s/)).toBeInTheDocument()
  })
})

describe('Editor generate from captions', () => {
  const episodeWithAnchors = {
    ...baseEpisode,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId }: { elementId: string }) => (
      <div data-testid={`player-${elementId}`} />
    ))
  })

  it('fetches generated segments and appends them to the list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            segments: [
              {
                id: 'seg-1',
                episodeId: 'ep-1',
                position: 0,
                label: null,
                cantoStart: 10,
                cantoEnd: 15,
                englishStart: 20,
                englishEnd: 30,
              },
            ],
          }),
      })
    )

    render(<Editor episode={episodeWithAnchors} segments={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate from captions' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/generate-segments',
        expect.objectContaining({ method: 'POST' })
      )
    )
    expect(await screen.findByText(/Segment 1/)).toBeInTheDocument()
  })

  it('shows an inline error when generation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'no captions' }) })
    )
    render(<Editor episode={episodeWithAnchors} segments={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate from captions' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no captions')
  })
})
