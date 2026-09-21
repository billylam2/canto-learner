import type { EpisodeAnchors } from './normalize'
import { englishTimeFor, cantoTimeFor } from './normalize'

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

export function cuesToCandidateSegments(cues: TimedCue[], anchors: EpisodeAnchors): CandidateSegment[] {
  return cues
    .filter((cue) => cue.start >= anchors.cantoContentStart && cue.end <= anchors.cantoContentEnd)
    .map((cue) => ({
      cantoStart: cue.start,
      cantoEnd: cue.end,
      englishStart: englishTimeFor(cue.start, anchors),
      englishEnd: englishTimeFor(cue.end, anchors),
    }))
}

// Same idea as cuesToCandidateSegments, but for cues timed on the english timeline (e.g. english
// diarized turns) — used when canto's own turns aren't usable as a reference, such as when speaker
// diarization isn't supported for the canto language at all (Cantonese, notably).
export function englishCuesToCandidateSegments(cues: TimedCue[], anchors: EpisodeAnchors): CandidateSegment[] {
  return cues
    .filter((cue) => cue.start >= anchors.englishContentStart && cue.end <= anchors.englishContentEnd)
    .map((cue) => ({
      cantoStart: cantoTimeFor(cue.start, anchors),
      cantoEnd: cantoTimeFor(cue.end, anchors),
      englishStart: cue.start,
      englishEnd: cue.end,
    }))
}
