import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

vi.mock('./waveform-marking', () => ({
  WaveformMarking: (props: {
    cantoPeaks: number[]
    englishPeaks: number[]
    isPlaying?: boolean
    cantoTimeSeconds?: number
    englishTimeSeconds?: number
    adjustingCheckpoint?: boolean
    onResyncNudge?: (deltaSeconds: number) => void
  }) => (
    <div data-testid="waveform-marking">
      <span data-testid="canto-peaks">{JSON.stringify(props.cantoPeaks)}</span>
      <span data-testid="english-peaks">{JSON.stringify(props.englishPeaks)}</span>
      <span data-testid="waveform-is-playing">{String(props.isPlaying)}</span>
      <span data-testid="waveform-canto-time">{props.cantoTimeSeconds}</span>
      <span data-testid="waveform-english-time">{props.englishTimeSeconds}</span>
      <span data-testid="waveform-adjusting-checkpoint">{String(props.adjustingCheckpoint)}</span>
      <button onClick={() => props.onResyncNudge?.(-1)}>trigger-resync-nudge</button>
    </div>
  ),
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

  it('edits and saves the Cantonese video ID on blur', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoneseVideoId: 'new-canto-id' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    const input = screen.getByLabelText('Edit Cantonese video ID')
    expect(input).toHaveValue('canto-a')
    fireEvent.change(input, { target: { value: 'new-canto-id' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cantoneseVideoId: 'new-canto-id' }) })
      )
    )
  })

  it('edits and saves the English video ID on blur', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, englishVideoId: 'new-eng-id' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    const input = screen.getByLabelText('Edit English video ID')
    fireEvent.change(input, { target: { value: 'new-eng-id' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ englishVideoId: 'new-eng-id' }) })
      )
    )
  })

  it('does not save a video ID when blurred unchanged', () => {
    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.blur(screen.getByLabelText('Edit Cantonese video ID'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('deletes an episode after confirming, and selects a remaining one', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)

    render(<Admin episodes={[episodeA, episodeB]} segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }} />)
    expect(screen.getByLabelText('Episode title')).toHaveValue('Muddy Puddles')

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'DELETE' }))
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Muddy Puddles' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Episode title')).toHaveValue('The Playgroup')
  })

  it('does not delete an episode when the confirmation is cancelled', () => {
    vi.stubGlobal('confirm', vi.fn(() => false))

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Muddy Puddles' })).toBeInTheDocument()
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

describe('Admin resync checkpoints', () => {
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

  it('disables the Resync checkpoint button until anchors are set', () => {
    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)
    expect(screen.getByRole('button', { name: 'Resync checkpoint' })).toBeDisabled()
  })

  it('is usable without starting synced playback first, so a checkpoint can be added from wherever the video is already paused', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('passes adjustingCheckpoint through to the waveform panel, and forwards its resync-drag nudges to the English player', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    expect(screen.getByTestId('waveform-adjusting-checkpoint')).toHaveTextContent('false')

    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))
    expect(screen.getByTestId('waveform-adjusting-checkpoint')).toHaveTextContent('true')

    fireEvent.click(screen.getByRole('button', { name: 'trigger-resync-nudge' }))
    expect(englishHandle.seekTo).toHaveBeenCalledWith(129, true)
  })

  it('entering adjustment mode pauses both players and shows the adjustment panel', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.queryByText(/Hold SPACE/)).not.toBeInTheDocument()
  })

  it("nudge buttons shift only the English player's current time by the expected delta", () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: '+0.5s' }))
    expect(englishHandle.seekTo).toHaveBeenCalledWith(130.5, true)

    fireEvent.click(screen.getByRole('button', { name: '-0.1s' }))
    expect(englishHandle.seekTo).toHaveBeenCalledWith(129.9, true)
  })

  it('Preview play/pause act on both players', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))
    vi.clearAllMocks()

    fireEvent.click(screen.getByRole('button', { name: 'Preview play' }))
    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Preview pause' }))
    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
  })

  it('Confirm posts the checkpoint, adds it to the table, and returns to the paused state', async () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 100)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ checkpoint: { id: 'chk-1', episodeId: 'ep-a', cantoTime: 60, englishTime: 100 } }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/checkpoints',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ cantoTime: 60, englishTime: 100 }) })
      )
    )
    await waitFor(() => expect(screen.getByDisplayValue('60')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })

  it('keeps the panel open and shows the server error when Confirm fails', async () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 100)
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Checkpoint must fall within the marked content' }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Checkpoint must fall within the marked content')
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('Cancel discards adjustment mode without a request', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 100)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })
})

describe('Admin waveform marking', () => {
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

  it('defaults to waveform marking, and toggles to the spacebar panel', () => {
    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)

    expect(screen.getByTestId('waveform-marking')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))

    expect(screen.queryByTestId('waveform-marking')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))

    expect(screen.getByTestId('waveform-marking')).toBeInTheDocument()
  })

  it('disables the Waveform marking toggle until anchors are set', () => {
    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    expect(screen.getByRole('button', { name: 'Waveform marking' })).toBeDisabled()
  })

  it('keeps Play synced, Go to content start, and Resync checkpoint available in waveform marking mode', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))

    expect(screen.getByRole('button', { name: 'Go to content start' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resync checkpoint' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
    expect(screen.getByTestId('waveform-marking')).toBeInTheDocument()
  })

  it('does not show the spacebar-marking hint while in waveform marking mode', () => {
    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    expect(screen.queryByText(/Hold SPACE/)).not.toBeInTheDocument()
  })

  it('does not mark a segment from the space bar while in waveform marking mode', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 15)
    const englishHandle = makeHandle(() => 25)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a/segments', expect.anything())
  })

  it('passes live playback time to the waveform panel only while synced playback is running', () => {
    vi.useFakeTimers()
    const refs = captureRefs()
    let cantoTime = 30
    let englishTime = 50
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => englishTime)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))

    expect(screen.getByTestId('waveform-is-playing')).toHaveTextContent('false')

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    cantoTime = 33
    englishTime = 53
    act(() => vi.advanceTimersByTime(200))

    expect(screen.getByTestId('waveform-is-playing')).toHaveTextContent('true')
    expect(screen.getByTestId('waveform-canto-time')).toHaveTextContent('33')
    expect(screen.getByTestId('waveform-english-time')).toHaveTextContent('53')

    vi.useRealTimers()
  })

  it('generates waveforms and makes the peaks available to the waveform panel', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          waveforms: [
            { id: 'wf-1', episodeId: 'ep-a', language: 'canto', peaks: [0.1, 0.2] },
            { id: 'wf-2', episodeId: 'ep-a', language: 'english', peaks: [0.3, 0.4] },
          ],
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate waveforms' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/waveforms',
        expect.objectContaining({ method: 'POST' })
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))

    await waitFor(() => expect(screen.getByTestId('canto-peaks')).toHaveTextContent('[0.1,0.2]'))
    expect(screen.getByTestId('english-peaks')).toHaveTextContent('[0.3,0.4]')
  })

  it('shows an error message when generating waveforms fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Cantonese audio (canto-a) failed: yt-dlp exited with code 1' }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate waveforms' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Cantonese audio (canto-a) failed: yt-dlp exited with code 1')
    )
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
    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    // pressed at 5, -0.5 = 4.5, but the floor (content start) clamps pendingStart to 10
    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 8 // released before the clamped start (10)
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('discards the press when a checkpoint jump would make englishEnd <= englishStart', () => {
    const refs = captureRefs()
    const cantoTime = 16
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    // Pressing and releasing at 16 gives pendingStart = 15 (the existing -1s offset). Checkpoint
    // 1 (at 15) shifts englishStart forward to 100; checkpoint 2 (at 16) shifts englishEnd back
    // down to 20 — a straddled backward jump that must discard rather than save cantoEnd < cantoStart.
    const checkpoints = [
      { id: 'chk-1', episodeId: 'ep-a', cantoTime: 15, englishTime: 100 },
      { id: 'chk-2', episodeId: 'ep-a', cantoTime: 16, englishTime: 20 },
    ]

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        checkpointsByEpisode={{ 'ep-a': checkpoints }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
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
    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })
})
