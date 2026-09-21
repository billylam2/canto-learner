import { describe, it, expect } from 'vitest'
import { computeResyncTarget } from './synced-playback'
import type { EpisodeAnchors } from './normalize'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('computeResyncTarget', () => {
  it('returns null when english is already close to the mapped target', () => {
    // cantoTime 60 -> englishTimeFor(60, anchors) = 120
    expect(computeResyncTarget(60, 120.3, anchors)).toBeNull()
  })

  it('returns the mapped target when english has drifted past the threshold', () => {
    expect(computeResyncTarget(60, 130, anchors)).toBe(120)
  })

  it('uses a custom threshold when given one', () => {
    expect(computeResyncTarget(60, 121, anchors, 0.5)).toBe(120)
    expect(computeResyncTarget(60, 120.4, anchors, 0.5)).toBeNull()
  })

  it('returns null instead of throwing when the anchors are momentarily out of order', () => {
    // e.g. mid-edit, after only one of the two content-end anchors has been re-marked. This runs
    // on a timer during synced playback, so it must never throw into an unhandled interval tick.
    const invertedAnchors: EpisodeAnchors = { ...anchors, cantoContentEnd: 5 }
    expect(computeResyncTarget(60, 120, invertedAnchors)).toBeNull()
  })
})
