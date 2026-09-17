import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LockedLevelCard } from './locked-level-card'

describe('LockedLevelCard', () => {
  it('shows the level name and a locked indicator as one continuous text run', () => {
    render(<LockedLevelCard name="Numbers" />)
    expect(screen.getByText(/Numbers — locked/)).toBeInTheDocument()
  })

  it('shows the unlock threshold when provided', () => {
    render(<LockedLevelCard name="Numbers" unlockThreshold={60} />)
    expect(screen.getByText(/unlocks at 60 stars/)).toBeInTheDocument()
  })

  it('does not show an unlock threshold when not provided', () => {
    render(<LockedLevelCard name="Numbers" />)
    expect(screen.queryByText(/unlocks at/)).not.toBeInTheDocument()
  })
})
