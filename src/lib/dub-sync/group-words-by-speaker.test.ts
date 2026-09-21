import { describe, it, expect } from 'vitest'
import { groupWordsBySpeaker, type TranscribedWord } from './group-words-by-speaker'

function word(overrides: Partial<TranscribedWord>): TranscribedWord {
  return { text: 'word', startTime: 0, endTime: 0, speakerTag: 1, ...overrides }
}

describe('groupWordsBySpeaker', () => {
  it('groups consecutive words from the same speaker into one segment', () => {
    const words = [
      word({ startTime: 0, endTime: 0.5, speakerTag: 1 }),
      word({ startTime: 0.5, endTime: 1.0, speakerTag: 1 }),
      word({ startTime: 1.0, endTime: 1.5, speakerTag: 1 }),
    ]
    expect(groupWordsBySpeaker(words)).toEqual([{ start: 0, end: 1.5 }])
  })

  it('starts a new group when the speaker tag changes', () => {
    const words = [
      word({ startTime: 0, endTime: 0.5, speakerTag: 1 }),
      word({ startTime: 0.5, endTime: 1.0, speakerTag: 1 }),
      word({ startTime: 1.2, endTime: 1.8, speakerTag: 2 }),
      word({ startTime: 1.8, endTime: 2.3, speakerTag: 2 }),
    ]
    expect(groupWordsBySpeaker(words)).toEqual([
      { start: 0, end: 1.0 },
      { start: 1.2, end: 2.3 },
    ])
  })

  it('returns one group per word when every word has a different speaker', () => {
    const words = [
      word({ startTime: 0, endTime: 0.5, speakerTag: 1 }),
      word({ startTime: 0.6, endTime: 1.1, speakerTag: 2 }),
      word({ startTime: 1.2, endTime: 1.7, speakerTag: 3 }),
    ]
    expect(groupWordsBySpeaker(words)).toEqual([
      { start: 0, end: 0.5 },
      { start: 0.6, end: 1.1 },
      { start: 1.2, end: 1.7 },
    ])
  })

  it('returns an empty array for no words', () => {
    expect(groupWordsBySpeaker([])).toEqual([])
  })
})
