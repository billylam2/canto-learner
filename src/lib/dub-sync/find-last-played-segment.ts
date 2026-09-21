import type { DubSegment } from '@/lib/db/dub-sync'

const MOSTLY_COMPLETED_THRESHOLD = 0.5

export function findLastPlayedSegment(currentTime: number, segments: DubSegment[]): DubSegment | null {
  const sorted = [...segments].sort((a, b) => a.position - b.position)

  let candidateIndex = -1
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].cantoStart <= currentTime) {
      candidateIndex = i
    } else {
      break
    }
  }

  if (candidateIndex === -1) return null

  const candidate = sorted[candidateIndex]
  if (currentTime > candidate.cantoEnd) {
    return candidate
  }

  const span = candidate.cantoEnd - candidate.cantoStart
  const elapsedFraction = span > 0 ? (currentTime - candidate.cantoStart) / span : 1

  if (elapsedFraction >= MOSTLY_COMPLETED_THRESHOLD) {
    return candidate
  }
  return candidateIndex > 0 ? sorted[candidateIndex - 1] : candidate
}
