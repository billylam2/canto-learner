export interface TimedWord {
  startTime: number
}

export function findNextWordStart(words: TimedWord[], afterTime: number, maxTime: number): number | null {
  const candidates = words.filter((word) => word.startTime >= afterTime && word.startTime <= maxTime)
  if (candidates.length === 0) return null
  return Math.min(...candidates.map((word) => word.startTime))
}
