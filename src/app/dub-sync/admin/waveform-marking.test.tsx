import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./waveform-track', () => ({
  WaveformTrack: (props: {
    color: string
    viewStartSeconds: number
    onViewStartChange: (v: number) => void
    onSelectionDrafted: (start: number, end: number) => void
    playheadSeconds: number | null
  }) => (
    <div>
      <button onClick={() => props.onSelectionDrafted(10, 12)}>{`draft-${props.color}`}</button>
      <button onClick={() => props.onViewStartChange(props.viewStartSeconds + 5)}>{`pan-${props.color}`}</button>
      <div data-testid={`viewstart-${props.color}`}>{props.viewStartSeconds}</div>
      <div data-testid={`playhead-${props.color}`}>{String(props.playheadSeconds)}</div>
    </div>
  ),
}))

import { WaveformMarking } from './waveform-marking'

const anchors = { cantoContentStart: 10, cantoContentEnd: 110, englishContentStart: 20, englishContentEnd: 220 }
const CANTO_COLOR = '#4ade80'
const ENGLISH_COLOR = '#60a5fa'

function renderMarking(overrides: Partial<Parameters<typeof WaveformMarking>[0]> = {}) {
  return render(
    <WaveformMarking
      episodeId="ep-1"
      cantoPeaks={[]}
      englishPeaks={[]}
      anchors={anchors}
      checkpoints={[]}
      segments={[]}
      onSegmentCreated={vi.fn()}
      {...overrides}
    />
  )
}

describe('WaveformMarking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('does not post when only the Cantonese side is drafted', () => {
    renderMarking()
    fireEvent.click(screen.getByRole('button', { name: `draft-${CANTO_COLOR}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm segment' }))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the combined segment once both sides are drafted, and clears both', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-1',
            position: 0,
            label: null,
            cantoStart: 10,
            cantoEnd: 12,
            englishStart: 10,
            englishEnd: 12,
          },
        }),
    } as Response)
    const onSegmentCreated = vi.fn()

    renderMarking({ onSegmentCreated })
    fireEvent.click(screen.getByRole('button', { name: `draft-${CANTO_COLOR}` }))
    fireEvent.click(screen.getByRole('button', { name: `draft-${ENGLISH_COLOR}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm segment' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 10, cantoEnd: 12, englishStart: 10, englishEnd: 12 }),
        })
      )
    )
    await waitFor(() => expect(onSegmentCreated).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Cancel Cantonese line' })).not.toBeInTheDocument()
  })

  it('Cancel clears a pending side without posting', () => {
    renderMarking()
    fireEvent.click(screen.getByRole('button', { name: `draft-${CANTO_COLOR}` }))
    expect(screen.getByRole('button', { name: 'Cancel Cantonese line' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Cantonese line' }))

    expect(screen.queryByRole('button', { name: 'Cancel Cantonese line' })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('syncs the English view to englishTimeFor(cantoViewCenter) when the Cantonese view pans', () => {
    renderMarking()
    fireEvent.click(screen.getByRole('button', { name: `pan-${CANTO_COLOR}` }))
    // cantoViewStart becomes 5; center = 5 + (800/60)/2 = 11.6667
    // englishTimeFor(11.6667, anchors) = 20 + ((11.6667-10)/100)*200 = 23.3333
    // englishViewStart = 23.3333 - 6.6667 = 16.6667
    expect(screen.getByTestId(`viewstart-${ENGLISH_COLOR}`)).toHaveTextContent(/^16\.6/)
  })

  it('keeps a manual English pan until the Cantonese view changes again', () => {
    renderMarking()
    const before = Number(screen.getByTestId(`viewstart-${ENGLISH_COLOR}`).textContent)

    fireEvent.click(screen.getByRole('button', { name: `pan-${ENGLISH_COLOR}` }))

    const after = Number(screen.getByTestId(`viewstart-${ENGLISH_COLOR}`).textContent)
    expect(after).toBeCloseTo(before + 5, 5)
  })

  it('passes the last-known playback time to each track as its playhead while paused, so it stays visible after pausing', () => {
    renderMarking({ isPlaying: false, cantoTimeSeconds: 42, englishTimeSeconds: 52 })

    expect(screen.getByTestId(`playhead-${CANTO_COLOR}`)).toHaveTextContent('42')
    expect(screen.getByTestId(`playhead-${ENGLISH_COLOR}`)).toHaveTextContent('52')
  })

  it('passes the live playback time to each track as its playhead while playing', () => {
    renderMarking({ isPlaying: true, cantoTimeSeconds: 42, englishTimeSeconds: 52 })

    expect(screen.getByTestId(`playhead-${CANTO_COLOR}`)).toHaveTextContent('42')
    expect(screen.getByTestId(`playhead-${ENGLISH_COLOR}`)).toHaveTextContent('52')
  })

  it('centers each view on its live playback time while playing', () => {
    renderMarking({ isPlaying: true, cantoTimeSeconds: 42, englishTimeSeconds: 52 })

    // TRACK_WIDTH=800, pixelsPerSecond=60 -> half window = 6.6667
    expect(screen.getByTestId(`viewstart-${CANTO_COLOR}`)).toHaveTextContent(/^35\.3/)
    expect(screen.getByTestId(`viewstart-${ENGLISH_COLOR}`)).toHaveTextContent(/^45\.3/)
  })
})
