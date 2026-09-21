import { describe, it, expect } from 'vitest'
import { pairDiarizedTurns } from './pair-diarized-turns'
import type { WordGroup } from './group-words-by-speaker'
import type { EpisodeAnchors } from './normalize'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('pairDiarizedTurns', () => {
  it('pairs turns 1:1 by order when both sides have the same count', () => {
    const cantoTurns: WordGroup[] = [
      { start: 10, end: 15 },
      { start: 20, end: 25 },
    ]
    const englishTurns: WordGroup[] = [
      { start: 21, end: 27 },
      { start: 40, end: 46 },
    ]

    const result = pairDiarizedTurns(cantoTurns, englishTurns, anchors)

    expect(result.usedFallback).toBe(false)
    expect(result.segments).toEqual([
      { cantoStart: 10, cantoEnd: 15, englishStart: 21, englishEnd: 27 },
      { cantoStart: 20, cantoEnd: 25, englishStart: 40, englishEnd: 46 },
    ])
  })

  it("excludes turns outside each side's content anchors before comparing counts", () => {
    const cantoTurns: WordGroup[] = [
      { start: 2, end: 5 }, // before cantoContentStart (10) — excluded
      { start: 10, end: 15 },
    ]
    const englishTurns: WordGroup[] = [
      { start: 21, end: 27 },
      { start: 300, end: 310 }, // after englishContentEnd (220) — excluded
    ]

    const result = pairDiarizedTurns(cantoTurns, englishTurns, anchors)

    expect(result.usedFallback).toBe(false)
    expect(result.segments).toEqual([{ cantoStart: 10, cantoEnd: 15, englishStart: 21, englishEnd: 27 }])
  })

  it('falls back to proportional stretch when the turn counts differ', () => {
    const cantoTurns: WordGroup[] = [
      { start: 10, end: 15 },
      { start: 20, end: 25 },
    ]
    const englishTurns: WordGroup[] = [{ start: 21, end: 27 }]

    const result = pairDiarizedTurns(cantoTurns, englishTurns, anchors)

    expect(result.usedFallback).toBe(true)
    expect(result.segments).toHaveLength(2)
    // englishStart/englishEnd come from englishTimeFor, not from the (mismatched) englishTurns
    expect(result.segments[0]).toEqual({ cantoStart: 10, cantoEnd: 15, englishStart: 20, englishEnd: 30 })
  })

  it('falls back when one side has no turns at all', () => {
    const cantoTurns: WordGroup[] = [{ start: 10, end: 15 }]
    const result = pairDiarizedTurns(cantoTurns, [], anchors)
    expect(result.usedFallback).toBe(true)
    expect(result.segments).toHaveLength(1)
  })
})
