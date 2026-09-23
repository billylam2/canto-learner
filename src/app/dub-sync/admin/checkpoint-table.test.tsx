import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CheckpointTable } from './checkpoint-table'

const checkpoint = { id: 'chk-1', episodeId: 'ep-1', cantoTime: 60, englishTime: 100 }

describe('CheckpointTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders one row per checkpoint with its current values', () => {
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByDisplayValue('60')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('saves a field on blur when its value changed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ checkpoint: { ...checkpoint, cantoTime: 65 } }),
    } as Response)
    const onUpdate = vi.fn()
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={onUpdate} onDelete={vi.fn()} />)

    const cantoTimeInput = screen.getByDisplayValue('60')
    fireEvent.change(cantoTimeInput, { target: { value: '65' } })
    fireEvent.blur(cantoTimeInput)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/checkpoints/chk-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cantoTime: 65 }) })
      )
    )
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ ...checkpoint, cantoTime: 65 }))
  })

  it('does not save when a field is blurred unchanged', async () => {
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    const cantoTimeInput = screen.getByDisplayValue('60')
    fireEvent.blur(cantoTimeInput)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows the server-provided error message and keeps the typed value when a save fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'A checkpoint already exists at that Cantonese time' }),
    } as Response)
    const onUpdate = vi.fn()
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={onUpdate} onDelete={vi.fn()} />)

    const cantoTimeInput = screen.getByDisplayValue('60')
    fireEvent.change(cantoTimeInput, { target: { value: '90' } })
    fireEvent.blur(cantoTimeInput)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A checkpoint already exists at that Cantonese time')
    )
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
  })

  it('deletes a checkpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
    const onDelete = vi.fn()
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/checkpoints/chk-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    )
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('chk-1'))
  })
})
