import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

function captureRefs() {
  let cantoRef: React.Ref<unknown> | undefined
  let englishRef: React.Ref<unknown> | undefined
  vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
    const ref = (props as { ref?: React.Ref<unknown> }).ref
    if (elementId === 'canto-player') cantoRef = ref
    if (elementId === 'english-player') englishRef = ref
    return <div data-testid={`player-${elementId}`} />
  })
  return {
    assign(cantoHandle: unknown, englishHandle: unknown) {
      if (cantoRef && typeof cantoRef === 'object' && 'current' in cantoRef) {
        ;(cantoRef as { current: unknown }).current = cantoHandle
      }
      if (englishRef && typeof englishRef === 'object' && 'current' in englishRef) {
        ;(englishRef as { current: unknown }).current = englishHandle
      }
    },
  }
}

function makeHandle(getCurrentTime: () => number) {
  return { seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getCurrentTime, setPlaybackRate: vi.fn() }
}

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists episodes and switches the selected panel without navigating', () => {
    render(<Admin episodes={[episodeA, episodeB]} segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }} />)

    expect(screen.getByLabelText('Episode title')).toHaveValue('Muddy Puddles')

    fireEvent.click(screen.getByRole('button', { name: 'The Playgroup' }))

    expect(screen.getByLabelText('Episode title')).toHaveValue('The Playgroup')
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

    await waitFor(() => expect(screen.getByLabelText('Episode title')).toHaveValue('New Episode'))
  })

  it('renames an episode on blur and reflects it in the episode list', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, title: 'Renamed Episode' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    const titleInput = screen.getByLabelText('Episode title')
    fireEvent.change(titleInput, { target: { value: 'Renamed Episode' } })
    fireEvent.blur(titleInput)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'Renamed Episode' }) })
      )
    )
    expect(screen.getByRole('button', { name: 'Renamed Episode' })).toBeInTheDocument()
  })

  it('marks the canto content start from the canto player and saves it', async () => {
    const refs = captureRefs()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 8 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(makeHandle(() => 8), makeHandle(() => 0))

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'PATCH' }))
    )
  })

  it('shows the current anchor values in editable fields, defaulting to 0 when null', () => {
    const episodeWithSomeAnchors = { ...episodeA, cantoContentStart: 29.3, englishContentEnd: 300 }
    render(<Admin episodes={[episodeWithSomeAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)

    const startInputs = screen.getAllByLabelText('Start')
    const endInputs = screen.getAllByLabelText('End')
    expect(startInputs[0]).toHaveValue(29.3) // canto
    expect(endInputs[0]).toHaveValue(0) // canto, unset
    expect(startInputs[1]).toHaveValue(0) // english, unset
    expect(endInputs[1]).toHaveValue(300) // english
  })

  it('saves a typed anchor value on blur', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 25 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    const cantoStartInput = screen.getAllByLabelText('Start')[0]
    fireEvent.change(cantoStartInput, { target: { value: '25' } })
    fireEvent.blur(cantoStartInput)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            cantoContentStart: 25,
            cantoContentEnd: 25,
            englishContentStart: 0,
            englishContentEnd: 0,
          }),
        })
      )
    )
  })
})

describe('Admin refine alignment', () => {
  const episodeWithBothStarts = {
    ...episodeA,
    cantoContentStart: 15.7394,
    englishContentStart: 14.7089,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId }: { elementId: string }) => (
      <div data-testid={`player-${elementId}`} />
    ))
  })

  it('does not show the refine-precision button until both content starts are marked', () => {
    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)
    expect(screen.queryByRole('button', { name: 'Refine precision' })).not.toBeInTheDocument()
  })

  it('runs refinement and shows an apply/dismiss suggestion', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          suggestedEnglishContentStart: 14.8089,
          startOffsetSeconds: 0.1,
          startAvgDistance: 2.24,
          startConfident: true,
          suggestedEnglishContentEnd: null,
          endOffsetSeconds: null,
          endAvgDistance: null,
          endConfident: null,
        }),
    } as Response)

    render(<Admin episodes={[episodeWithBothStarts]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refine precision' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/refine-alignment',
        expect.objectContaining({ method: 'POST' })
      )
    )
    expect(await screen.findByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(screen.getByText(/14\.81/)).toBeInTheDocument()
  })

  it('applies the suggested englishContentStart while keeping other anchors unchanged', async () => {
    vi.mocked(fetch).mockImplementation((url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('refine-alignment')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              suggestedEnglishContentStart: 14.8089,
              startOffsetSeconds: 0.1,
              startAvgDistance: 2.24,
              startConfident: true,
              suggestedEnglishContentEnd: null,
              endOffsetSeconds: null,
              endAvgDistance: null,
              endConfident: null,
            }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            episode: { ...episodeWithBothStarts, englishContentStart: 14.8089 },
          }),
      } as Response)
    })

    render(<Admin episodes={[episodeWithBothStarts]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refine precision' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            cantoContentStart: 15.7394,
            cantoContentEnd: 0,
            englishContentStart: 14.8089,
            englishContentEnd: 0,
          }),
        })
      )
    )
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })

  it('dismisses the suggestion without saving anything', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          suggestedEnglishContentStart: 14.8089,
          startOffsetSeconds: 0.1,
          startAvgDistance: 2.24,
          startConfident: true,
          suggestedEnglishContentEnd: null,
          endOffsetSeconds: null,
          endAvgDistance: null,
          endConfident: null,
        }),
    } as Response)

    render(<Admin episodes={[episodeWithBothStarts]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refine precision' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1) // only the refine-alignment call, never a PATCH
  })

  it('shows an error message when refinement fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Failed to refine alignment: yt-dlp exited with code 1' }),
    } as Response)

    render(<Admin episodes={[episodeWithBothStarts]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refine precision' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('yt-dlp exited with code 1'))
  })

  it('also applies a suggested content end when the response includes one', async () => {
    const episodeWithBothAnchors = {
      ...episodeWithBothStarts,
      cantoContentEnd: 286.273,
      englishContentEnd: 285.344,
    }
    vi.mocked(fetch).mockImplementation((url: unknown) => {
      const u = String(url)
      if (u.includes('refine-alignment')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              suggestedEnglishContentStart: 14.8089,
              startOffsetSeconds: 0.1,
              startAvgDistance: 2.24,
              startConfident: true,
              suggestedEnglishContentEnd: 285.5,
              endOffsetSeconds: 0.156,
              endAvgDistance: 3.1,
              endConfident: true,
            }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ episode: episodeWithBothAnchors }),
      } as Response)
    })

    render(<Admin episodes={[episodeWithBothAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refine precision' }))

    expect(await screen.findByText(/Suggested English end: 285\.50/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            cantoContentStart: 15.7394,
            cantoContentEnd: 286.273,
            englishContentStart: 14.8089,
            englishContentEnd: 285.5,
          }),
        })
      )
    )
  })
})

describe('Admin generate from captions', () => {
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

describe('Admin synced playback', () => {
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
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays both videos when starting synced playback, and shows a pause toggle', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
  })

  it('speeds both videos up to 1.25x when starting synced playback', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    expect(cantoHandle.setPlaybackRate).toHaveBeenCalledWith(1.25)
    expect(englishHandle.setPlaybackRate).toHaveBeenCalledWith(1.25)
  })

  it('pauses both videos when stopping synced playback, and resets the playback rate', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause synced' }))

    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
    expect(cantoHandle.setPlaybackRate).toHaveBeenCalledWith(1)
    expect(englishHandle.setPlaybackRate).toHaveBeenCalledWith(1)
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })

  it('seeks both players to the content-start anchors and starts synced playback', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Go to content start' }))

    expect(cantoHandle.seekTo).toHaveBeenCalledWith(10, true)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(20, true)
    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
  })

  it('re-seeks the english player only once drift exceeds the threshold', () => {
    vi.useFakeTimers()
    const refs = captureRefs()
    let cantoTime = 60 // englishTimeFor(60, anchors) = 120
    let englishTime = 120.2 // within the 0.75s threshold
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => englishTime)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).not.toHaveBeenCalled()

    englishTime = 130
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(120, true)
  })
})

describe('Admin play segment from the segment table', () => {
  const episodeWithAnchors = {
    ...episodeA,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }
  const existingSegment = {
    id: 'seg-1',
    episodeId: 'ep-a',
    position: 0,
    label: null,
    cantoStart: 15,
    cantoEnd: 35,
    englishStart: 30,
    englishEnd: 70,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('plays the segment in Cantonese first, not simultaneously with English', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 15)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [existingSegment] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(cantoHandle.seekTo).toHaveBeenCalledWith(15, true)
    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.seekTo).not.toHaveBeenCalled()
    expect(englishHandle.playVideo).not.toHaveBeenCalled()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays the English portion once the Cantonese portion finishes', () => {
    vi.useFakeTimers()
    const refs = captureRefs()
    let cantoTime = 15
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [existingSegment] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    cantoTime = 34 // still before the segment's end (35)
    act(() => vi.advanceTimersByTime(200))
    expect(cantoHandle.pauseVideo).not.toHaveBeenCalled()
    expect(englishHandle.playVideo).not.toHaveBeenCalled()

    cantoTime = 35 // reached the segment's end
    act(() => vi.advanceTimersByTime(200))
    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.seekTo).toHaveBeenCalledWith(30, true)
    expect(englishHandle.playVideo).toHaveBeenCalled()
  })

  it('cancels a segment review in progress if synced playback is started instead', () => {
    vi.useFakeTimers()
    const refs = captureRefs()
    let cantoTime = 15
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [existingSegment] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play' })) // reviewing seg-1 (canto 15-35)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' })) // switches modes
    englishHandle.playVideo.mockClear()
    englishHandle.seekTo.mockClear()

    cantoTime = 35 // would have been the old segment's end
    act(() => vi.advanceTimersByTime(200))

    // The old segment-review chain must be cancelled, not fire English on its own mid-sync.
    expect(englishHandle.playVideo).not.toHaveBeenCalled()
    expect(englishHandle.seekTo).not.toHaveBeenCalled()
  })
})

describe('Admin spacebar marking', () => {
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
  })

  it('creates a segment from a press-and-release cycle, offsetting the start by 1s', async () => {
    const refs = captureRefs()
    let cantoTime = 20
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 19,
            cantoEnd: 30,
            englishStart: 38,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 30
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 19, cantoEnd: 30, englishStart: 38, englishEnd: 60 }),
        })
      )
    )
  })

  it('clamps the start to the previous segment end when the 1s offset would overlap it', async () => {
    const refs = captureRefs()
    let cantoTime = 35.5
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-2',
            episodeId: 'ep-a',
            position: 1,
            label: null,
            cantoStart: 35,
            cantoEnd: 45,
            englishStart: 70,
            englishEnd: 90,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{
          'ep-a': [
            { id: 'seg-1', episodeId: 'ep-a', position: 0, label: null, cantoStart: 15, cantoEnd: 35, englishStart: 30, englishEnd: 70 },
          ],
        }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    // Pressed at 35.5, so an unclamped -1s offset would be 34.5 — before the previous
    // segment's end (35). The clamp must keep the start at 35, not 34.5.
    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 45
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 35, cantoEnd: 45, englishStart: 70, englishEnd: 90 }),
        })
      )
    )
  })

  it('discards the press without posting when release is not after the clamped start', () => {
    const refs = captureRefs()
    let cantoTime = 5 // before the content-start anchor (10)
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    // pressed at 5, -0.5 = 4.5, but the floor (content start) clamps pendingStart to 10
    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 8 // released before the clamped start (10)
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not restart the pending start on a key-repeat keydown while held', async () => {
    const refs = captureRefs()
    let cantoTime = 20
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 19,
            cantoEnd: 30,
            englishStart: 38,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' }) // real press at 20 -> pendingStart 19
    cantoTime = 25
    // OS auto-repeat while the key stays held must be ignored, not recompute pendingStart from 25
    fireEvent.keyDown(window, { code: 'Space', repeat: true })
    cantoTime = 30
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          body: JSON.stringify({ cantoStart: 19, cantoEnd: 30, englishStart: 38, englishEnd: 60 }),
        })
      )
    )
  })

  it('prevents the browser default on every repeated keydown while Space is held', () => {
    // Regression test: only the first (non-repeat) keydown was calling preventDefault, so the
    // browser's own default action for Space (scroll the page down) fired on every OS
    // auto-repeat event during a long hold, walking the page to the bottom before release.
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 20)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    const firstPressNotPrevented = fireEvent.keyDown(window, { code: 'Space' })
    const repeatNotPrevented = fireEvent.keyDown(window, { code: 'Space', repeat: true })

    // fireEvent's return value is the raw dispatchEvent() result: false means some handler
    // called preventDefault().
    expect(firstPressNotPrevented).toBe(false)
    expect(repeatNotPrevented).toBe(false)
  })

  it('does nothing when synced playback is not running', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 20)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })
})
