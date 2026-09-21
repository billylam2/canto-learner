import { describe, it, expect } from 'vitest'
import { englishTimeFor, type EpisodeAnchors } from './normalize'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('englishTimeFor', () => {
  it('maps the canto content start to the english content start', () => {
    expect(englishTimeFor(10, anchors)).toBe(20)
  })

  it('maps the canto content end to the english content end', () => {
    expect(englishTimeFor(110, anchors)).toBe(220)
  })

  it('interpolates proportionally for a point in between', () => {
    expect(englishTimeFor(60, anchors)).toBe(120)
  })

  it('throws when the canto anchor span is zero or negative', () => {
    const zeroSpan: EpisodeAnchors = { ...anchors, cantoContentEnd: 10 }
    expect(() => englishTimeFor(10, zeroSpan)).toThrow('Invalid anchors')
  })
})
