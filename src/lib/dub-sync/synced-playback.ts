import type { EpisodeAnchors } from './normalize'
import { englishTimeFor } from './normalize'

const DEFAULT_THRESHOLD_SECONDS = 0.75

export function computeResyncTarget(
  cantoTime: number,
  englishCurrentTime: number,
  anchors: EpisodeAnchors,
  thresholdSeconds: number = DEFAULT_THRESHOLD_SECONDS
): number | null {
  // This runs on a timer during synced playback, so a momentarily-invalid anchor span (e.g.
  // mid-edit, after only one of the two content-end anchors has been re-marked) must not throw
  // into an unhandled interval tick — just skip resyncing until the anchors are valid again.
  let target: number
  try {
    target = englishTimeFor(cantoTime, anchors)
  } catch {
    return null
  }
  return Math.abs(englishCurrentTime - target) > thresholdSeconds ? target : null
}
