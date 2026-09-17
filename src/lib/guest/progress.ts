import type { ProgressRow } from '@/lib/db/progress'

const STORAGE_KEY = 'canto-guest-progress'

export function getGuestProgress(): ProgressRow[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGuestLevelProgress(levelId: number, starsEarned: number, gameType: string): ProgressRow[] {
  const progress = getGuestProgress()
  const existing = progress.find((row) => row.levelId === levelId)

  const bestStars = Math.max(existing?.starsEarned ?? 0, starsEarned)
  const existingGameTypes = existing?.completedGameTypes ?? []
  const completedGameTypes = existingGameTypes.includes(gameType)
    ? existingGameTypes
    : [...existingGameTypes, gameType]

  const updatedRow: ProgressRow = { levelId, starsEarned: bestStars, completedGameTypes }
  const updatedProgress = existing
    ? progress.map((row) => (row.levelId === levelId ? updatedRow : row))
    : [...progress, updatedRow]

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProgress))
  }

  return updatedProgress
}

export function clearGuestProgress(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
