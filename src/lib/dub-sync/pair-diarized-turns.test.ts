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

  it('falls back to english-turn boundaries proportionally mapped to canto, when the turn counts differ', () => {
    // Speaker diarization isn't supported for every canto language (e.g. Cantonese), so a
    // diarized-turn-count mismatch usually means canto's turns are unusable (often just one giant
    // blob) while english's are real. Prefer english's boundaries as the reference in that case,
    // rather than the old behavior of trusting canto's (likely degenerate) turns.
    const cantoTurns: WordGroup[] = [{ start: 10, end: 110 }] // one giant undiarized blob
    const englishTurns: WordGroup[] = [
      { start: 20, end: 30 },
      { start: 120, end: 130 },
    ]

    const result = pairDiarizedTurns(cantoTurns, englishTurns, anchors)

    expect(result.usedFallback).toBe(true)
    // cantoStart/cantoEnd come from cantoTimeFor, not from the (mismatched) cantoTurns
    expect(result.segments).toEqual([
      { cantoStart: 10, cantoEnd: 15, englishStart: 20, englishEnd: 30 },
      { cantoStart: 60, cantoEnd: 65, englishStart: 120, englishEnd: 130 },
    ])
  })

  it('falls back to canto-turn boundaries when english has no usable turns either', () => {
    const cantoTurns: WordGroup[] = [{ start: 10, end: 15 }]
    const result = pairDiarizedTurns(cantoTurns, [], anchors)
    expect(result.usedFallback).toBe(true)
    expect(result.segments).toEqual([{ cantoStart: 10, cantoEnd: 15, englishStart: 20, englishEnd: 30 }])
  })
})
