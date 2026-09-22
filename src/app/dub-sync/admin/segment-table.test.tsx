import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SegmentTable } from './segment-table'

const segment = {
  id: 'seg-1',
  episodeId: 'ep-1',
  position: 0,
  label: 'Hello',
  cantoStart: 10,
  cantoEnd: 14,
  englishStart: 20,
  englishEnd: 25,
}

describe('SegmentTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders one row per segment with its current values', () => {
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={vi.fn()} onDelete={vi.fn()} onPlay={vi.fn()} />)
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
    expect(screen.getByDisplayValue('14')).toBeInTheDocument()
  })

  it('saves a field on blur when its value changed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ segment: { ...segment, cantoEnd: 16 } }),
    } as Response)
    const onUpdate = vi.fn()
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={onUpdate} onDelete={vi.fn()} onPlay={vi.fn()} />)

    const cantoEndInput = screen.getByDisplayValue('14')
    fireEvent.change(cantoEndInput, { target: { value: '16' } })
    fireEvent.blur(cantoEndInput)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments/seg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cantoEnd: 16 }) })
      )
    )
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ ...segment, cantoEnd: 16 }))
  })

  it('does not save when a field is blurred unchanged', async () => {
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={vi.fn()} onDelete={vi.fn()} onPlay={vi.fn()} />)
    const cantoEndInput = screen.getByDisplayValue('14')
    fireEvent.blur(cantoEndInput)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows an inline error and keeps the typed value when a save fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const onUpdate = vi.fn()
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={onUpdate} onDelete={vi.fn()} onPlay={vi.fn()} />)

    const cantoEndInput = screen.getByDisplayValue('14')
    fireEvent.change(cantoEndInput, { target: { value: '16' } })
    fireEvent.blur(cantoEndInput)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save'))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('16')).toBeInTheDocument()
  })

  it('deletes a segment', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
    const onDelete = vi.fn()
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={vi.fn()} onDelete={onDelete} onPlay={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments/seg-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    )
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('seg-1'))
  })

  it('calls onPlay with the segment when Play is clicked', () => {
    const onPlay = vi.fn()
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={vi.fn()} onDelete={vi.fn()} onPlay={onPlay} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(onPlay).toHaveBeenCalledWith(segment)
  })
})
