import type { EpisodeAnchors, ResyncCheckpoint } from './normalize'
import { englishTimeFor } from './normalize'

export interface TimedCue {
  start: number
  end: number
}

export interface CandidateSegment {
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

export function cuesToCandidateSegments(
  cues: TimedCue[],
  anchors: EpisodeAnchors,
  checkpoints: ResyncCheckpoint[] = []
): CandidateSegment[] {
  return cues
    .filter((cue) => cue.start >= anchors.cantoContentStart && cue.end <= anchors.cantoContentEnd)
    .map((cue) => ({
      cantoStart: cue.start,
      cantoEnd: cue.end,
      englishStart: englishTimeFor(cue.start, anchors, checkpoints),
      englishEnd: englishTimeFor(cue.end, anchors, checkpoints),
    }))
}
