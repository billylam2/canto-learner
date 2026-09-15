import { describe, it, expect } from 'vitest'
import { computeLevelStatus } from './level-status'

const LEVELS = [
  { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 },
  { id: 2, name: 'People & Family', order: 2, unlockThreshold: 20 },
  { id: 3, name: 'Descriptors & Animals', order: 3, unlockThreshold: 40 },
]

describe('computeLevelStatus', () => {
  it('always unlocks a level with a 0 threshold', () => {
    const result = computeLevelStatus(LEVELS, [])
    expect(result[0]).toMatchObject({ id: 1, unlocked: true, starsEarned: 0 })
  })

  it('locks a level when total stars are below its threshold', () => {
    const result = computeLevelStatus(LEVELS, [{ levelId: 1, starsEarned: 10, completedGameTypes: [] }])
    expect(result[1]).toMatchObject({ id: 2, unlocked: false })
  })

  it('unlocks a level once total stars meet its threshold', () => {
    const result = computeLevelStatus(LEVELS, [{ levelId: 1, starsEarned: 24, completedGameTypes: [] }])
    expect(result[1]).toMatchObject({ id: 2, unlocked: true })
  })

  it('sums stars across multiple levels toward later thresholds', () => {
    const result = computeLevelStatus(LEVELS, [
      { levelId: 1, starsEarned: 24, completedGameTypes: [] },
      { levelId: 2, starsEarned: 20, completedGameTypes: [] },
    ])
    expect(result[2]).toMatchObject({ id: 3, unlocked: true })
  })

  it("reports each level's own stars earned", () => {
    const result = computeLevelStatus(LEVELS, [{ levelId: 2, starsEarned: 15, completedGameTypes: [] }])
    expect(result[1].starsEarned).toBe(15)
  })
})
