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

describe('englishTimeFor with checkpoints', () => {
  it('behaves exactly like the zero-checkpoint case before the first checkpoint', () => {
    const checkpoints = [{ cantoTime: 60, englishTime: 100 }]
    expect(englishTimeFor(30, anchors, checkpoints)).toBe(englishTimeFor(30, anchors))
  })

  it('applies the checkpoint shift once its cantoTime is reached', () => {
    // base(60) = 20 + (50/100)*200 = 120. Checkpoint says english should actually be 100 there,
    // so shift = 100 - 120 = -20.
    const checkpoints = [{ cantoTime: 60, englishTime: 100 }]
    expect(englishTimeFor(60, anchors, checkpoints)).toBe(100)
    // base(80) = 20 + (70/100)*200 = 160; shift still -20 -> 140.
    expect(englishTimeFor(80, anchors, checkpoints)).toBe(140)
  })

  it('uses the most recent checkpoint once a later one is also crossed', () => {
    const checkpoints = [
      { cantoTime: 60, englishTime: 100 }, // shift -20
      { cantoTime: 90, englishTime: 150 }, // base(90) = 20+(80/100)*200=180, shift = 150-180 = -30
    ]
    // Between the two checkpoints, the first one's shift (-20) still applies.
    expect(englishTimeFor(70, anchors, checkpoints)).toBe(englishTimeFor(70, anchors) - 20)
    // At and after the second, its shift (-30) applies instead.
    expect(englishTimeFor(90, anchors, checkpoints)).toBe(150)
    expect(englishTimeFor(100, anchors, checkpoints)).toBe(englishTimeFor(100, anchors) - 30)
  })

  it('supports a checkpoint correcting backward relative to the base line', () => {
    // base(60) = 120; a checkpoint saying english should be earlier (110) is legitimate.
    const checkpoints = [{ cantoTime: 60, englishTime: 110 }]
    expect(englishTimeFor(60, anchors, checkpoints)).toBe(110)
    expect(englishTimeFor(70, anchors, checkpoints)).toBeLessThan(englishTimeFor(70, anchors))
  })

  it('ignores checkpoint order in the input array (sorts internally)', () => {
    const inOrder = [
      { cantoTime: 60, englishTime: 100 },
      { cantoTime: 90, englishTime: 150 },
    ]
    const reversed = [inOrder[1], inOrder[0]]
    expect(englishTimeFor(95, anchors, reversed)).toBe(englishTimeFor(95, anchors, inOrder))
  })
})
