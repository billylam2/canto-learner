import { describe, it, expect } from 'vitest'
import { computeLevelStatus, computeLifetimeStars } from './level-status'

const LEVELS = [
  { id: 1, name: 'Greetings', order: 1 },
  { id: 2, name: 'People & Family', order: 2 },
  { id: 3, name: 'Descriptors & Animals', order: 3 },
]

// Level 2 has scene content; levels 1 and 3 do not, for these tests.
const LEVEL_IDS_WITH_SCENES = new Set([2])

describe('computeLevelStatus', () => {
  it('always unlocks the first level', () => {
    const result = computeLevelStatus(LEVELS, [], LEVEL_IDS_WITH_SCENES)
    expect(result[0]).toMatchObject({ id: 1, unlocked: true, starsEarned: 0 })
  })

  it("locks the next level until the previous no-scene level's listen-tap is completed", () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 1, starsEarned: 10, completedGameTypes: [] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: false })
  })

  it('unlocks the next level once the previous no-scene level completes listen-tap', () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: true })
  })

  it('does not unlock the next level from listen-tap alone when the previous level has a scene', () => {
    const result = computeLevelStatus(
      LEVELS,
      [
        { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
        { levelId: 2, starsEarned: 3, completedGameTypes: ['listen-tap'] },
      ],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[2]).toMatchObject({ id: 3, unlocked: false })
  })

  it('unlocks the next level once the previous scene-having level completes find-scene', () => {
    const result = computeLevelStatus(
      LEVELS,
      [
        { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
        { levelId: 2, starsEarned: 6, completedGameTypes: ['listen-tap', 'find-scene'] },
      ],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[2]).toMatchObject({ id: 3, unlocked: true })
  })

  it('reports sceneUnlocked false for a scene-having level until its own listen-tap is completed', () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: true, sceneUnlocked: false })
  })

  it('reports sceneUnlocked true once a scene-having level completes its own listen-tap', () => {
    const result = computeLevelStatus(
      LEVELS,
      [
        { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
        { levelId: 2, starsEarned: 3, completedGameTypes: ['listen-tap'] },
      ],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, sceneUnlocked: true })
  })

  it('never unlocks a level whose own listen-tap has not happened, even with unrelated other progress', () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 3, starsEarned: 9, completedGameTypes: ['listen-tap'] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: false })
  })

  it("reports each level's own stars earned", () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 2, starsEarned: 15, completedGameTypes: [] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1].starsEarned).toBe(15)
  })
})

describe('computeLifetimeStars', () => {
  it('sums stars earned across all levels', () => {
    const progress = [
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
      { levelId: 2, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ]
    expect(computeLifetimeStars(progress)).toBe(34)
  })

  it('returns 0 for empty progress', () => {
    expect(computeLifetimeStars([])).toBe(0)
  })
})
