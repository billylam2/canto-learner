import { describe, it, expect } from 'vitest'
import { findLastPlayedSegment } from './find-last-played-segment'
import type { DubSegment } from '@/lib/db/dub-sync'

function makeSegment(overrides: Partial<DubSegment> & { position: number }): DubSegment {
  return {
    id: `seg-${overrides.position}`,
    episodeId: 'ep-1',
    label: null,
    cantoStart: 0,
    cantoEnd: 0,
    englishStart: 0,
    englishEnd: 0,
    ...overrides,
  }
}

const seg1 = makeSegment({ position: 0, cantoStart: 10, cantoEnd: 14, englishStart: 20, englishEnd: 25 })
const seg2 = makeSegment({ position: 1, cantoStart: 20, cantoEnd: 24, englishStart: 40, englishEnd: 45 })
const seg3 = makeSegment({ position: 2, cantoStart: 30, cantoEnd: 34, englishStart: 60, englishEnd: 65 })
const segments = [seg1, seg2, seg3]

describe('findLastPlayedSegment', () => {
  it('returns null before the first segment has started', () => {
    expect(findLastPlayedSegment(5, segments)).toBeNull()
  })

  it('returns the current segment when mostly through it', () => {
    // 13 is 75% through seg1 (10-14)
    expect(findLastPlayedSegment(13, segments)).toBe(seg1)
  })

  it('falls back to the previous segment when the current one has barely started', () => {
    // 21 is 25% through seg2 (20-24); seg1 already finished
    expect(findLastPlayedSegment(21, segments)).toBe(seg1)
  })

  it('returns the current (first) segment when barely started but there is no previous segment', () => {
    // 10.5 is 12.5% through seg1, but there's nothing before it to fall back to
    expect(findLastPlayedSegment(10.5, segments)).toBe(seg1)
  })

  it('returns the current segment when exactly at the halfway point', () => {
    // 22 is exactly 50% through seg2 (20-24)
    expect(findLastPlayedSegment(22, segments)).toBe(seg2)
  })

  it('returns the just-finished segment when paused between two segments', () => {
    // 17 is after seg1 ends (14) and before seg2 starts (20)
    expect(findLastPlayedSegment(17, segments)).toBe(seg1)
  })

  it('returns the last segment when paused after everything has finished', () => {
    expect(findLastPlayedSegment(40, segments)).toBe(seg3)
  })

  it('returns null for an empty segment list', () => {
    expect(findLastPlayedSegment(50, [])).toBeNull()
  })
})
