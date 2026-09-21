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
})
