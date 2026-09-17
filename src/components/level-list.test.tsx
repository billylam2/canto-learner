import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LevelList } from './level-list'
import type { LevelStatus } from '@/lib/game/level-status'

describe('LevelList', () => {
  it('shows unlocked levels with a Listen & Tap link and locked levels as a locked card', () => {
    const levels: LevelStatus[] = [
      { id: 1, name: 'Greetings', order: 1, starsEarned: 10, unlocked: true, sceneUnlocked: false },
      { id: 2, name: 'People & Family', order: 2, starsEarned: 0, unlocked: false, sceneUnlocked: false },
    ]
    render(<LevelList levels={levels} />)

    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    // Level 1 (Greetings) has 8 vocab items, so its max is 8 * 3 = 24 stars.
    expect(within(greetingsItem as HTMLElement).getByText('10 / 24 stars')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute('href', '/play/1')
    expect(screen.getByText(/People & Family — locked — finish the previous level first/)).toBeInTheDocument()
  })

  it('shows no Find in the Scene link or button for levels with no scene content', () => {
    const levels: LevelStatus[] = [
      { id: 1, name: 'Greetings', order: 1, starsEarned: 200, unlocked: true, sceneUnlocked: true },
    ]
    render(<LevelList levels={levels} />)

    // Level 1 (Greetings) has no scene content, so nothing scene-related
    // renders even though it (and sceneUnlocked) is true.
    expect(screen.queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })

  it('shows an enabled Find in the Scene link when the scene is unlocked', () => {
    const levels: LevelStatus[] = [
      { id: 2, name: 'People & Family', order: 2, starsEarned: 12, unlocked: true, sceneUnlocked: true },
    ]
    render(<LevelList levels={levels} />)

    // Level 2 (People & Family) has scene content.
    expect(screen.getByRole('link', { name: 'Find in the Scene' })).toHaveAttribute('href', '/play/2/scene')
  })

  it('shows a disabled Find in the Scene button with a hint when the scene is locked', () => {
    const levels: LevelStatus[] = [
      { id: 2, name: 'People & Family', order: 2, starsEarned: 0, unlocked: true, sceneUnlocked: false },
    ]
    render(<LevelList levels={levels} />)

    expect(screen.getByRole('button', { name: 'Find in the Scene' })).toBeDisabled()
    expect(screen.getByText('Finish Listen & Tap first')).toBeInTheDocument()
  })
})
