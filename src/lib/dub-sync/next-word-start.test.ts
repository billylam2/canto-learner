import { describe, it, expect } from 'vitest'
import { findNextWordStart } from './next-word-start'

describe('findNextWordStart', () => {
  it('returns the earliest word start at or after the given time', () => {
    const words = [{ startTime: 5 }, { startTime: 12 }, { startTime: 20 }]
    expect(findNextWordStart(words, 10, 100)).toBe(12)
  })

  it('includes a word starting exactly at the given time', () => {
    const words = [{ startTime: 10 }]
    expect(findNextWordStart(words, 10, 100)).toBe(10)
  })

  it('excludes words starting after the max time', () => {
    const words = [{ startTime: 50 }]
    expect(findNextWordStart(words, 10, 20)).toBeNull()
  })

  it('returns null when there are no words at or after the given time', () => {
    const words = [{ startTime: 1 }, { startTime: 2 }]
    expect(findNextWordStart(words, 10, 100)).toBeNull()
  })

  it('returns null for an empty word list', () => {
    expect(findNextWordStart([], 0, 100)).toBeNull()
  })
})
