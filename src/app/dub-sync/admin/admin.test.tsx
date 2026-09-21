import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

import { Admin } from './admin'
import { YoutubePlayer } from '@/components/dub-sync/youtube-player'

const episodeA = {
  id: 'ep-a',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-a',
  englishVideoId: 'eng-a',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}
const episodeB = {
  id: 'ep-b',
  title: 'The Playgroup',
  cantoneseVideoId: 'canto-b',
  englishVideoId: 'eng-b',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists episodes and switches the selected panel without navigating', () => {
    render(<Admin episodes={[episodeA, episodeB]} segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }} />)

    expect(screen.getByRole('heading', { name: 'Muddy Puddles' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'The Playgroup' }))

    expect(screen.getByRole('heading', { name: 'The Playgroup' })).toBeInTheDocument()
  })

  it('selects a newly created episode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeB, id: 'ep-c', title: 'New Episode' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Episode' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'c' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Episode' })).toBeInTheDocument())
  })

  it('marks the canto content start from the canto player and saves it', async () => {
    let capturedRef: React.Ref<unknown> | undefined
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
      if (elementId === 'canto-player') capturedRef = (props as { ref?: React.Ref<unknown> }).ref
      return <div data-testid={`player-${elementId}`} />
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 8 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    if (capturedRef && typeof capturedRef === 'object' && 'current' in capturedRef) {
      ;(capturedRef as { current: unknown }).current = {
        seekTo: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        getCurrentTime: () => 8,
      }
    }

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'PATCH' }))
    )
  })
})

describe('Admin manual segment creation', () => {
  const episodeWithAnchors = {
    ...episodeA,
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

  it('marks start then end and saves a segment', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 20,
            cantoEnd: 30,
            englishStart: 40,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark start' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark end' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save segment' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})

describe('Admin auto-mark and generate from captions', () => {
  const episodeWithAnchors = {
    ...episodeA,
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

  it('runs auto-mark, shows a working state, and appends returned segments', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-mark from speech' }))

    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()

    resolveFetch({
      ok: true,
      json: () =>
        Promise.resolve({
          segments: [
            {
              id: 'seg-1',
              episodeId: 'ep-a',
              position: 0,
              label: null,
              cantoStart: 10,
              cantoEnd: 15,
              englishStart: 20,
              englishEnd: 26,
            },
          ],
        }),
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Auto-mark from speech' })).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/episodes/ep-a/auto-mark',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('shows a warning (not an error) when auto-mark falls back to proportional timing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ segments: [], warning: "turn counts didn't match (3 vs 2)" }),
      })
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-mark from speech' }))

    await waitFor(() => expect(screen.getByText(/turn counts didn't match/)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error when auto-mark fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'yt-dlp not found' }) })
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-mark from speech' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('yt-dlp not found'))
  })

  it('runs generate from captions and appends returned segments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            segments: [
              {
                id: 'seg-2',
                episodeId: 'ep-a',
                position: 0,
                label: null,
                cantoStart: 10,
                cantoEnd: 15,
                englishStart: 20,
                englishEnd: 26,
              },
            ],
          }),
      })
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate from captions' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/generate-segments',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
