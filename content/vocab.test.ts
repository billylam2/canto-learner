import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { LEVELS, VOCAB_ITEMS } from './vocab'

describe('vocab content', () => {
  it('has exactly 31 items', () => {
    expect(VOCAB_ITEMS.length).toBe(31)
  })

  it('has a unique slug for every item', () => {
    const slugs = VOCAB_ITEMS.map((item) => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has non-empty Cantonese text, jyutping, and English gloss for every item', () => {
    for (const item of VOCAB_ITEMS) {
      expect(item.cantonese.length).toBeGreaterThan(0)
      expect(item.jyutping.length).toBeGreaterThan(0)
      expect(item.englishGloss.length).toBeGreaterThan(0)
    }
  })

  it('references only levels that exist', () => {
    const levelIds = new Set(LEVELS.map((level) => level.id))
    for (const item of VOCAB_ITEMS) {
      expect(levelIds.has(item.level)).toBe(true)
    }
  })

  it('flags dog and nine as a homophone pair', () => {
    const dog = VOCAB_ITEMS.find((item) => item.slug === 'dog')
    const nine = VOCAB_ITEMS.find((item) => item.slug === 'number-9')
    expect(dog?.homophoneGroup).toBe('gau2')
    expect(nine?.homophoneGroup).toBe('gau2')
  })

  it('has 4 levels in ascending order', () => {
    expect(LEVELS.map((level) => level.order)).toEqual([1, 2, 3, 4])
  })
})

describe('vocab images', () => {
  it('has a matching SVG image file for every item', () => {
    for (const item of VOCAB_ITEMS) {
      const imagePath = path.resolve(import.meta.dirname, 'images', `${item.slug}.svg`)
      expect(existsSync(imagePath)).toBe(true)
    }
  })
})
