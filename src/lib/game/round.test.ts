import { describe, it, expect } from 'vitest'
import { buildRounds, pickDistractors, createSeededRandom, shuffleItems, type VocabGameItem } from './round'

function makeItem(overrides: Partial<VocabGameItem> & { id: string }): VocabGameItem {
  return {
    id: overrides.id,
    slug: overrides.slug ?? overrides.id,
    audioUrl: `https://example.com/${overrides.id}.mp3`,
    imageUrl: `https://example.com/${overrides.id}.svg`,
    homophoneGroup: overrides.homophoneGroup ?? null,
  }
}

describe('buildRounds', () => {
  it('splits 8 items into two rounds of 4', () => {
    const items = Array.from({ length: 8 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([4, 4])
  })

  it('splits 9 items into three rounds of 3', () => {
    const items = Array.from({ length: 9 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([3, 3, 3])
  })

  it('keeps 4 items in a single round', () => {
    const items = Array.from({ length: 4 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([4])
  })

  it('splits 10 items into rounds of 4, 3, 3', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([4, 3, 3])
  })

  it('preserves item order across rounds', () => {
    const items = Array.from({ length: 8 }, (_, i) => makeItem({ id: `${i}` }))
    const flatIds = buildRounds(items)
      .flat()
      .map((item) => item.id)
    expect(flatIds).toEqual(items.map((item) => item.id))
  })
})

describe('pickDistractors', () => {
  const pool = [
    makeItem({ id: 'dog', homophoneGroup: 'gau2' }),
    makeItem({ id: 'nine', homophoneGroup: 'gau2' }),
    makeItem({ id: 'cat' }),
    makeItem({ id: 'big' }),
  ]

  it('never includes the target itself', () => {
    const target = pool[2]
    const distractors = pickDistractors(pool, target, 2)
    expect(distractors.some((item) => item.id === target.id)).toBe(false)
  })

  it('never includes a homophone of the target', () => {
    const target = pool[0]
    const distractors = pickDistractors(pool, target, 2)
    expect(distractors.some((item) => item.homophoneGroup === 'gau2')).toBe(false)
  })

  it('returns the requested count when enough candidates exist', () => {
    const target = pool[2]
    const distractors = pickDistractors(pool, target, 2)
    expect(distractors.length).toBe(2)
  })
})

describe('createSeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const sequenceA = [createSeededRandom('hello'), createSeededRandom('hello')].map((rand) => [
      rand(),
      rand(),
      rand(),
    ])
    expect(sequenceA[0]).toEqual(sequenceA[1])
  })

  it('produces different sequences for different seeds', () => {
    const randomA = createSeededRandom('hello')
    const randomB = createSeededRandom('goodbye')
    expect(randomA()).not.toBe(randomB())
  })

  it('produces values in the [0, 1) range', () => {
    const random = createSeededRandom('hello')
    for (let i = 0; i < 20; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('shuffleItems', () => {
  it('produces the same order for two independent seeded generators with the same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const resultA = shuffleItems(items, createSeededRandom('hello'))
    const resultB = shuffleItems(items, createSeededRandom('hello'))
    expect(resultA).toEqual(resultB)
  })

  it('contains exactly the same elements as the input', () => {
    const items = ['a', 'b', 'c']
    const shuffled = shuffleItems(items, createSeededRandom('hello'))
    expect([...shuffled].sort()).toEqual([...items].sort())
  })

  it('makes exactly items.length - 1 calls to random', () => {
    const items = ['a', 'b', 'c', 'd']
    let calls = 0
    const random = () => {
      calls += 1
      return 0.5
    }
    shuffleItems(items, random)
    expect(calls).toBe(items.length - 1)
  })
})
