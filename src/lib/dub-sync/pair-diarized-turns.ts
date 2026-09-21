import type { WordGroup } from './group-words-by-speaker'
import type { EpisodeAnchors } from './normalize'
import { cuesToCandidateSegments } from './candidate-segments'

export interface DiarizedSegment {
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

export interface PairDiarizedTurnsResult {
  segments: DiarizedSegment[]
  usedFallback: boolean
}

export function pairDiarizedTurns(
  cantoTurns: WordGroup[],
  englishTurns: WordGroup[],
  anchors: EpisodeAnchors
): PairDiarizedTurnsResult {
  const filteredCanto = cantoTurns.filter(
    (turn) => turn.start >= anchors.cantoContentStart && turn.end <= anchors.cantoContentEnd
  )
  const filteredEnglish = englishTurns.filter(
    (turn) => turn.start >= anchors.englishContentStart && turn.end <= anchors.englishContentEnd
  )

  if (filteredCanto.length > 0 && filteredCanto.length === filteredEnglish.length) {
    return {
      segments: filteredCanto.map((canto, index) => ({
        cantoStart: canto.start,
        cantoEnd: canto.end,
        englishStart: filteredEnglish[index].start,
        englishEnd: filteredEnglish[index].end,
      })),
      usedFallback: false,
    }
  }

  return {
    segments: cuesToCandidateSegments(cantoTurns, anchors),
    usedFallback: true,
  }
}
