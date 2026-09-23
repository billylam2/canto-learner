import type { EpisodeAnchors, ResyncCheckpoint } from './normalize'

// A checkpoint must fall strictly within the marked content span, and not collide with an
// existing checkpoint's exact cantoTime (which would make "the most recently encountered
// checkpoint" ambiguous). There's no constraint relative to other checkpoints' englishTime — a
// checkpoint correcting backward is legitimate. Returns an error message, or null if valid.
export function validateCheckpointOrder(
  anchors: EpisodeAnchors,
  otherCheckpoints: ResyncCheckpoint[],
  candidate: ResyncCheckpoint
): string | null {
  if (candidate.cantoTime <= anchors.cantoContentStart || candidate.cantoTime >= anchors.cantoContentEnd) {
    return 'Checkpoint must fall within the marked content'
  }
  if (otherCheckpoints.some((checkpoint) => checkpoint.cantoTime === candidate.cantoTime)) {
    return 'A checkpoint already exists at that Cantonese time'
  }
  return null
}
