import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WaveformTrack } from './waveform-track'

function mockCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    set fillStyle(_: string) {},
    set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    set font(_: string) {},
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
  allowDragSelect: true,
  color: '#4ade80',
  playheadSeconds: null,
  checkpointSeconds: [],
  resyncMode: false,
  onResyncDrag: vi.fn(),
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

  it('does not draft a selection via drag when allowDragSelect is false', () => {
    const onSelectionDrafted = vi.fn()
    const { container } = render(
      <WaveformTrack {...defaultProps} allowDragSelect={false} onSelectionDrafted={onSelectionDrafted} />
    )
    const canvas = container.querySelector('canvas')!

    fireEvent.mouseDown(canvas, { clientX: 60 })
    fireEvent.mouseMove(window, { clientX: 180 })
    fireEvent.mouseUp(window)

    expect(onSelectionDrafted).not.toHaveBeenCalled()
  })

  it('in resync mode, dragging nudges by the delta instead of drafting a selection', () => {
    const onSelectionDrafted = vi.fn()
    const onResyncDrag = vi.fn()
    const { container } = render(
      <WaveformTrack
        {...defaultProps}
        resyncMode={true}
        onResyncDrag={onResyncDrag}
        onSelectionDrafted={onSelectionDrafted}
      />
    )
    const canvas = container.querySelector('canvas')!

    // pixelsPerSecond=60: dragging right by 60px should nudge backward by -1s (earlier audio
    // comes under the fixed reference point when you drag right), then a further 30px -> -0.5s.
    fireEvent.mouseDown(canvas, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 160 })
    fireEvent.mouseMove(window, { clientX: 190 })
    fireEvent.mouseUp(window)

    expect(onResyncDrag).toHaveBeenNthCalledWith(1, -1)
    expect(onResyncDrag).toHaveBeenNthCalledWith(2, -0.5)
    expect(onSelectionDrafted).not.toHaveBeenCalled()
  })

  it('draws a marker and label at each checkpoint position', () => {
    const ctx = mockCanvas()
    render(<WaveformTrack {...defaultProps} checkpointSeconds={[2]} />)

    // pixelsPerSecond=60, viewStartSeconds=0 -> 2s is x=120
    expect(ctx.moveTo).toHaveBeenCalledWith(120, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(120, 90)
    expect(ctx.fillText).toHaveBeenCalledWith('2.0s', 122, 10)
  })

  it('does not draw a checkpoint marker outside the visible view', () => {
    const ctx = mockCanvas()
    render(<WaveformTrack {...defaultProps} checkpointSeconds={[50]} />)

    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('does not pan on scroll/wheel — trackpad horizontal scroll panned too aggressively, so panning is button-only now', () => {
    const onViewStartChange = vi.fn()
    const { container } = render(<WaveformTrack {...defaultProps} onViewStartChange={onViewStartChange} />)
    const canvas = container.querySelector('canvas')!

    fireEvent.wheel(canvas, { deltaX: 60, deltaY: 0 })

    expect(onViewStartChange).not.toHaveBeenCalled()
  })

  it('draws a playhead line at the given position', () => {
    const ctx = mockCanvas()
    render(<WaveformTrack {...defaultProps} playheadSeconds={2} />)

    // pixelsPerSecond=60, viewStartSeconds=0 -> 2s is x=120
    expect(ctx.moveTo).toHaveBeenCalledWith(120, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(120, 90)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('does not draw a playhead line when there is none', () => {
    const ctx = mockCanvas()
    render(<WaveformTrack {...defaultProps} playheadSeconds={null} />)

    expect(ctx.moveTo).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('does not draw a playhead line when it is outside the visible view', () => {
    const ctx = mockCanvas()
    render(<WaveformTrack {...defaultProps} viewStartSeconds={0} playheadSeconds={50} />)

    expect(ctx.moveTo).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it("keeps the canvas at its intrinsic pixel size instead of stretching to fill a flex parent", () => {
    // Regression test: this canvas sits in a flex-column container, whose default
    // align-items: stretch otherwise blows the canvas's rendered CSS size up past its 800x90
    // drawing buffer — which silently desyncs every click's computed time from the pointer.
    const { container } = render(<WaveformTrack {...defaultProps} />)
    const canvas = container.querySelector('canvas')!

    expect(canvas.className).toContain('self-start')
  })

  it('pans right by a fifth of the visible window when the right button is clicked', () => {
    const onViewStartChange = vi.fn()
    const { getByTitle } = render(<WaveformTrack {...defaultProps} onViewStartChange={onViewStartChange} />)

    fireEvent.click(getByTitle('Scroll the waveform right'))

    // visible window = 800/60 = 13.3333s; a fifth of that is 2.6667s
    expect(onViewStartChange).toHaveBeenCalledWith(expect.closeTo(2.6667, 3))
  })

  it('pans left by a fifth of the visible window when the left button is clicked', () => {
    const onViewStartChange = vi.fn()
    const { getByTitle } = render(
      <WaveformTrack {...defaultProps} viewStartSeconds={10} onViewStartChange={onViewStartChange} />
    )

    fireEvent.click(getByTitle('Scroll the waveform left'))

    expect(onViewStartChange).toHaveBeenCalledWith(expect.closeTo(7.3333, 3))
  })

  it('does not pan left of the start of the track via the left button', () => {
    const onViewStartChange = vi.fn()
    const { getByTitle } = render(
      <WaveformTrack {...defaultProps} viewStartSeconds={1} onViewStartChange={onViewStartChange} />
    )

    fireEvent.click(getByTitle('Scroll the waveform left'))

    expect(onViewStartChange).toHaveBeenCalledWith(0)
  })
})
