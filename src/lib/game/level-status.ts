import type { LevelSource } from '../../../content/vocab'
import type { ProgressRow } from '../db/progress'

export interface LevelStatus {
  id: number
  name: string
  order: number
  starsEarned: number
  unlocked: boolean
  sceneUnlocked: boolean
}

export function computeLevelStatus(
  levels: LevelSource[],
  progress: ProgressRow[],
  levelIdsWithScenes: Set<number>
): LevelStatus[] {
  const progressByLevel = new Map(progress.map((row) => [row.levelId, row]))
  const sortedLevels = [...levels].sort((a, b) => a.order - b.order)

  function terminalStepFor(levelId: number): string {
    return levelIdsWithScenes.has(levelId) ? 'find-scene' : 'listen-tap'
  }

  function hasCompleted(levelId: number, gameType: string): boolean {
    return progressByLevel.get(levelId)?.completedGameTypes.includes(gameType) ?? false
  }

  return sortedLevels.map((level, index) => {
    const previousLevel = sortedLevels[index - 1]
    const unlocked = index === 0 || hasCompleted(previousLevel.id, terminalStepFor(previousLevel.id))
    const sceneUnlocked = unlocked && hasCompleted(level.id, 'listen-tap')

    return {
      id: level.id,
      name: level.name,
      order: level.order,
      starsEarned: progressByLevel.get(level.id)?.starsEarned ?? 0,
      unlocked,
      sceneUnlocked,
    }
  })
}

export function computeLifetimeStars(progress: ProgressRow[]): number {
  return progress.reduce((sum, row) => sum + row.starsEarned, 0)
}
