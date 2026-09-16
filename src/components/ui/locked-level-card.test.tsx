import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LockedLevelCard } from './locked-level-card'

describe('LockedLevelCard', () => {
  it('shows the level name and a locked indicator as one continuous text run', () => {
    render(<LockedLevelCard name="Numbers" />)
    expect(screen.getByText(/Numbers — locked/)).toBeInTheDocument()
  })
})
