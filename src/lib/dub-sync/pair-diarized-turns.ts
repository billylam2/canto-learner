import type { WordGroup } from './group-words-by-speaker'
import type { EpisodeAnchors } from './normalize'
import { cuesToCandidateSegments, englishCuesToCandidateSegments } from './candidate-segments'

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

  // Speaker diarization isn't supported for every canto language (notably Cantonese, at all), so a
  // count mismatch usually means canto's turns are unusable (often a single undiarized blob) while
  // english's are real. Prefer english's boundaries as the reference when it has any; only fall
  // back to canto's own (likely degenerate) turns when english has none either.
  if (filteredEnglish.length > 0) {
    return {
      segments: englishCuesToCandidateSegments(englishTurns, anchors),
      usedFallback: true,
    }
  }

  return {
    segments: cuesToCandidateSegments(cantoTurns, anchors),
    usedFallback: true,
  }
}
