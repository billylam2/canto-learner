import { describe, it, expect, beforeEach } from 'vitest'
import { getGuestProgress, saveGuestLevelProgress, clearGuestProgress } from './progress'

describe('getGuestProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns an empty array when nothing is stored', () => {
    expect(getGuestProgress()).toEqual([])
  })

  it('returns previously saved progress', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(getGuestProgress()).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('returns an empty array for unparseable stored data', () => {
    window.localStorage.setItem('canto-guest-progress', 'not json')
    expect(getGuestProgress()).toEqual([])
  })
})

describe('saveGuestLevelProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('creates a new progress row when none exists', () => {
    const result = saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('keeps the higher star total on replay', () => {
    saveGuestLevelProgress(1, 20, 'listen-tap')
    const result = saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 20, completedGameTypes: ['listen-tap'] }])
  })

  it('replaces a lower star total with a new best', () => {
    saveGuestLevelProgress(1, 5, 'listen-tap')
    const result = saveGuestLevelProgress(1, 18, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 18, completedGameTypes: ['listen-tap'] }])
  })

  it('adds a new game type without duplicating existing ones', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    const result = saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('adds a second game type for the same level', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    const result = saveGuestLevelProgress(1, 9, 'find-scene')
    expect(result).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap', 'find-scene'] }])
  })

  it('persists across calls to getGuestProgress', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(getGuestProgress()).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('tracks separate levels independently', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    const result = saveGuestLevelProgress(2, 6, 'listen-tap')
    expect(result).toEqual([
      { levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] },
      { levelId: 2, starsEarned: 6, completedGameTypes: ['listen-tap'] },
    ])
  })
})

describe('clearGuestProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('removes previously saved progress', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    clearGuestProgress()
    expect(getGuestProgress()).toEqual([])
  })

  it('does nothing when there is no stored progress', () => {
    clearGuestProgress()
    expect(getGuestProgress()).toEqual([])
  })
})
