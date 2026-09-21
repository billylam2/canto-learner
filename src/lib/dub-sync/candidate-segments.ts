import type { CaptionCue } from './captions'
import type { EpisodeAnchors } from './normalize'
import { englishTimeFor } from './normalize'

export interface CandidateSegment {
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

export function cuesToCandidateSegments(cues: CaptionCue[], anchors: EpisodeAnchors): CandidateSegment[] {
  return cues
    .filter((cue) => cue.start >= anchors.cantoContentStart && cue.end <= anchors.cantoContentEnd)
    .map((cue) => ({
      cantoStart: cue.start,
      cantoEnd: cue.end,
      englishStart: englishTimeFor(cue.start, anchors),
      englishEnd: englishTimeFor(cue.end, anchors),
    }))
}
