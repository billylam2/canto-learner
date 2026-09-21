import type { EpisodeAnchors } from './normalize'
import { englishTimeFor } from './normalize'

const DEFAULT_THRESHOLD_SECONDS = 0.75

export function computeResyncTarget(
  cantoTime: number,
  englishCurrentTime: number,
  anchors: EpisodeAnchors,
  thresholdSeconds: number = DEFAULT_THRESHOLD_SECONDS
): number | null {
  const target = englishTimeFor(cantoTime, anchors)
  return Math.abs(englishCurrentTime - target) > thresholdSeconds ? target : null
}
