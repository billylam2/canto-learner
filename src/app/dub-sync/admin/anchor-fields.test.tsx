import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AnchorFields } from './anchor-fields'

describe('AnchorFields', () => {
  it('renders the current start and end values', () => {
    render(<AnchorFields start={15.5} end={286.2} onSaveStart={vi.fn()} onSaveEnd={vi.fn()} />)

    expect(screen.getByLabelText('Start')).toHaveValue(15.5)
    expect(screen.getByLabelText('End')).toHaveValue(286.2)
  })

  it('defaults unset (null) values to 0', () => {
    render(<AnchorFields start={null} end={null} onSaveStart={vi.fn()} onSaveEnd={vi.fn()} />)

    expect(screen.getByLabelText('Start')).toHaveValue(0)
    expect(screen.getByLabelText('End')).toHaveValue(0)
  })

  it('calls onSaveStart with the typed value on blur', () => {
    const onSaveStart = vi.fn()
    render(<AnchorFields start={10} end={110} onSaveStart={onSaveStart} onSaveEnd={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '20' } })
    fireEvent.blur(screen.getByLabelText('Start'))

    expect(onSaveStart).toHaveBeenCalledWith(20)
  })

  it('calls onSaveEnd with the typed value on blur', () => {
    const onSaveEnd = vi.fn()
    render(<AnchorFields start={10} end={110} onSaveStart={vi.fn()} onSaveEnd={onSaveEnd} />)

    fireEvent.change(screen.getByLabelText('End'), { target: { value: '120' } })
    fireEvent.blur(screen.getByLabelText('End'))

    expect(onSaveEnd).toHaveBeenCalledWith(120)
  })

  it('does not call the save callback on blur when the value did not change', () => {
    const onSaveStart = vi.fn()
    render(<AnchorFields start={10} end={110} onSaveStart={onSaveStart} onSaveEnd={vi.fn()} />)

    fireEvent.blur(screen.getByLabelText('Start'))

    expect(onSaveStart).not.toHaveBeenCalled()
  })

  it('resets the draft when the start/end props change externally', () => {
    const { rerender } = render(<AnchorFields start={10} end={110} onSaveStart={vi.fn()} onSaveEnd={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '99' } })
    rerender(<AnchorFields start={25} end={110} onSaveStart={vi.fn()} onSaveEnd={vi.fn()} />)

    expect(screen.getByLabelText('Start')).toHaveValue(25)
  })
})
