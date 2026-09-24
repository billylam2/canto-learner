import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WaveformTrack } from './waveform-track'

function mockCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    set fillStyle(_: string) {},
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 90,
    width: 800,
    height: 90,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return ctx
}

const defaultProps = {
  peaks: [0.1, 0.5, 0.9, 0.3, 0.2],
  bucketMs: 50,
  width: 800,
  height: 90,
  pixelsPerSecond: 60,
  viewStartSeconds: 0,
  onViewStartChange: vi.fn(),
  markedRanges: [],
  pendingSelection: null,
  onSelectionDrafted: vi.fn(),
  color: '#4ade80',
}

describe('WaveformTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCanvas()
  })

  it('draws without throwing', () => {
    expect(() => render(<WaveformTrack {...defaultProps} />)).not.toThrow()
  })

  it('drafts a selection from a click-drag, in seconds relative to the view', () => {
    const onSelectionDrafted = vi.fn()
    const { container } = render(<WaveformTrack {...defaultProps} onSelectionDrafted={onSelectionDrafted} />)
    const canvas = container.querySelector('canvas')!

    // pixelsPerSecond=60, viewStartSeconds=0 -> x=60 is 1.0s, x=180 is 3.0s
    fireEvent.mouseDown(canvas, { clientX: 60 })
    fireEvent.mouseMove(window, { clientX: 180 })
    fireEvent.mouseUp(window)

    expect(onSelectionDrafted).toHaveBeenCalledTimes(1)
    const [start, end] = onSelectionDrafted.mock.calls[0]
    expect(start).toBeCloseTo(1.0, 5)
    expect(end).toBeCloseTo(3.0, 5)
  })

  it('does not draft a selection for a plain click with no real drag', () => {
    const onSelectionDrafted = vi.fn()
    const { container } = render(<WaveformTrack {...defaultProps} onSelectionDrafted={onSelectionDrafted} />)
    const canvas = container.querySelector('canvas')!

    fireEvent.mouseDown(canvas, { clientX: 100 })
    fireEvent.mouseUp(window)

    expect(onSelectionDrafted).not.toHaveBeenCalled()
  })

  it('reports a panned view start on horizontal scroll', () => {
    const onViewStartChange = vi.fn()
    const { container } = render(<WaveformTrack {...defaultProps} onViewStartChange={onViewStartChange} />)
    const canvas = container.querySelector('canvas')!

    // pixelsPerSecond=60, so a 60px deltaX pans by 1 second.
    fireEvent.wheel(canvas, { deltaX: 60, deltaY: 0 })

    expect(onViewStartChange).toHaveBeenCalledWith(1)
  })

  it('does not pan before the start of the track', () => {
    const onViewStartChange = vi.fn()
    const { container } = render(
      <WaveformTrack {...defaultProps} viewStartSeconds={0.5} onViewStartChange={onViewStartChange} />
    )
    const canvas = container.querySelector('canvas')!

    fireEvent.wheel(canvas, { deltaX: -60, deltaY: 0 }) // would go to -0.5s

    expect(onViewStartChange).toHaveBeenCalledWith(0)
  })
})
