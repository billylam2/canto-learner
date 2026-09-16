import { describe, it, expect } from 'vitest'
import { isPointInHotspot } from './scene-hit-test'

const HOTSPOT = { xPercent: 20, yPercent: 20, widthPercent: 30, heightPercent: 30 }

describe('isPointInHotspot', () => {
  it('returns true for a point inside the hotspot', () => {
    expect(isPointInHotspot(35, 35, HOTSPOT)).toBe(true)
  })

  it('returns true for a point within the padding just outside the hotspot edge', () => {
    // hotspot right edge is at 50; padding extends the hit area to 55
    expect(isPointInHotspot(52, 35, HOTSPOT)).toBe(true)
  })

  it('returns false for a point beyond the padding', () => {
    expect(isPointInHotspot(60, 35, HOTSPOT)).toBe(false)
  })

  it('returns false for a point far outside the hotspot', () => {
    expect(isPointInHotspot(90, 90, HOTSPOT)).toBe(false)
  })

  it('clamps padding at the image edges', () => {
    const edgeHotspot = { xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }
    expect(isPointInHotspot(-3, 5, edgeHotspot)).toBe(false)
    expect(isPointInHotspot(0, 5, edgeHotspot)).toBe(true)
  })
})
