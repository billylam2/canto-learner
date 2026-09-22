import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  return { seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getCurrentTime }
}

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists episodes and switches the selected panel without navigating', () => {
    render(
      <Admin
        episodes={[episodeA, episodeB]}
        segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }}
        cantoWordsByEpisode={{ 'ep-a': [], 'ep-b': [] }}
      />
    )

    expect(screen.getByRole('heading', { name: 'Muddy Puddles' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'The Playgroup' }))

    expect(screen.getByRole('heading', { name: 'The Playgroup' })).toBeInTheDocument()
  })

  it('selects a newly created episode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeB, id: 'ep-c', title: 'New Episode' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} cantoWordsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Episode' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'c' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Episode' })).toBeInTheDocument())
  })

  it('marks the canto content start from the canto player and saves it', async () => {
    const refs = captureRefs()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 8 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} cantoWordsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(makeHandle(() => 8), makeHandle(() => 0))

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'PATCH' }))
    )
  })

  it('shows the current anchor values in editable fields, defaulting to 0 when null', () => {
    const episodeWithSomeAnchors = { ...episodeA, cantoContentStart: 29.3, englishContentEnd: 300 }
    render(
      <Admin
        episodes={[episodeWithSomeAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )

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

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} cantoWordsByEpisode={{ 'ep-a': [] }} />)

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

describe('Admin transcribe canto and generate from captions', () => {
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

  it('runs transcribe canto, shows a working state, and clears it on success', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )
    )

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transcribe Cantonese' }))

    expect(screen.getByRole('button', { name: 'Transcribing…' })).toBeDisabled()

    resolveFetch({
      ok: true,
      json: () =>
        Promise.resolve({ words: [{ id: 'w-1', episodeId: 'ep-a', text: '你好', startTime: 1, endTime: 1.5 }] }),
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Transcribe Cantonese' })).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/episodes/ep-a/transcribe-canto',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('shows an error when transcription fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'yt-dlp not found' }) })
    )

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transcribe Cantonese' }))

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

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
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

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
  })

  it('pauses both videos when stopping synced playback', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause synced' }))

    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })

  it('seeks both players to the content-start anchors and starts synced playback', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
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

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).not.toHaveBeenCalled()

    englishTime = 130
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(120, true)
  })
})

describe('Admin mark segment end', () => {
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

  it('marks a segment, inferring the start from the next word after the content start', async () => {
    const refs = captureRefs()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 15,
            cantoEnd: 35,
            englishStart: 30,
            englishEnd: 70,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [{ id: 'w-1', episodeId: 'ep-a', text: 'hi', startTime: 15, endTime: 15.5 }] }}
      />
    )
    refs.assign(makeHandle(() => 35), makeHandle(() => 60))

    fireEvent.click(screen.getByRole('button', { name: 'Mark segment end' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 15, cantoEnd: 35, englishStart: 30, englishEnd: 70 }),
        })
      )
    )
  })

  it('falls back to the previous segment end when no word is found after it', async () => {
    const refs = captureRefs()
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
            cantoEnd: 50,
            englishStart: 70,
            englishEnd: 100,
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
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(makeHandle(() => 50), makeHandle(() => 80))

    fireEvent.click(screen.getByRole('button', { name: 'Mark segment end' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 35, cantoEnd: 50, englishStart: 70, englishEnd: 100 }),
        })
      )
    )
  })

  it('does not reuse the same start for two rapid presses before the first request resolves', () => {
    // segmentsByEpisode only updates once a response comes back, so without a synchronous floor,
    // both presses would read the same (still-empty) segments state and compute the same start.
    const refs = captureRefs()
    let cantoTime = 20
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => {})) // never resolves during this test
    )

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Mark segment end' }))
    cantoTime = 40
    fireEvent.click(screen.getByRole('button', { name: 'Mark segment end' }))

    expect(fetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    const secondBody = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string)

    expect(firstBody).toEqual({ cantoStart: 10, cantoEnd: 20, englishStart: 20, englishEnd: 40 })
    expect(secondBody).toEqual({ cantoStart: 20, cantoEnd: 40, englishStart: 40, englishEnd: 80 })
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

  it('seeks both players to the segment and starts synced playback when Play is clicked', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [existingSegment] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(cantoHandle.seekTo).toHaveBeenCalledWith(15, true)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(30, true)
    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
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

  it('creates a segment from a press-and-release cycle, offsetting the start by 0.5s', async () => {
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
            cantoStart: 19.5,
            cantoEnd: 30,
            englishStart: 39,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
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
          body: JSON.stringify({ cantoStart: 19.5, cantoEnd: 30, englishStart: 39, englishEnd: 60 }),
        })
      )
    )
  })

  it('clamps the start to the previous segment end when the 0.5s offset would overlap it', async () => {
    const refs = captureRefs()
    let cantoTime = 35.2
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
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    // Pressed at 35.2, so an unclamped -0.5s offset would be 34.7 — before the previous
    // segment's end (35). The clamp must keep the start at 35, not 34.7.
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

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
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
            cantoStart: 19.5,
            cantoEnd: 30,
            englishStart: 39,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' }) // real press at 20 -> pendingStart 19.5
    cantoTime = 25
    // OS auto-repeat while the key stays held must be ignored, not recompute pendingStart from 25
    fireEvent.keyDown(window, { code: 'Space', repeat: true })
    cantoTime = 30
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          body: JSON.stringify({ cantoStart: 19.5, cantoEnd: 30, englishStart: 39, englishEnd: 60 }),
        })
      )
    )
  })

  it('does nothing when synced playback is not running', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 20)
    const englishHandle = makeHandle(() => 0)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    // deliberately do not click "Play synced"

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })
})
