import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LevelList } from './level-list'
import type { LevelStatus } from '@/lib/game/level-status'

describe('LevelList', () => {
  it('shows unlocked levels with a Listen & Tap link and locked levels as plain text', () => {
    const levels: LevelStatus[] = [
      { id: 1, name: 'Greetings', order: 1, starsEarned: 10, unlocked: true },
      { id: 2, name: 'People & Family', order: 2, starsEarned: 0, unlocked: false },
    ]
    render(<LevelList levels={levels} />)

    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    expect(within(greetingsItem as HTMLElement).getByText('10 stars')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute('href', '/play/1')
    expect(screen.getByText(/People & Family — locked/)).toBeInTheDocument()
  })

  it('shows a Find in the Scene link only for levels that have scene content', () => {
    const levels: LevelStatus[] = [{ id: 1, name: 'Greetings', order: 1, starsEarned: 200, unlocked: true }]
    render(<LevelList levels={levels} />)

    // Level 1 (Greetings) has no scene content, so no scene link even though unlocked.
    expect(screen.queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })
})
