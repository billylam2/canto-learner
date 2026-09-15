import type { LevelSource } from '../../../content/vocab'
import type { ProgressRow } from '../db/progress'

export interface LevelStatus {
  id: number
  name: string
  order: number
  starsEarned: number
  unlocked: boolean
}

export function computeLevelStatus(levels: LevelSource[], progress: ProgressRow[]): LevelStatus[] {
  const starsByLevel = new Map(progress.map((row) => [row.levelId, row.starsEarned]))
  const totalStars = progress.reduce((sum, row) => sum + row.starsEarned, 0)

  return [...levels]
    .sort((a, b) => a.order - b.order)
    .map((level) => ({
      id: level.id,
      name: level.name,
      order: level.order,
      starsEarned: starsByLevel.get(level.id) ?? 0,
      unlocked: totalStars >= level.unlockThreshold,
    }))
}
