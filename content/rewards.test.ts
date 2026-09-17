import { describe, it, expect } from 'vitest'
import { PET, ACCESSORIES } from './rewards'

describe('reward content', () => {
  it('has a pet with a non-empty slug and name', () => {
    expect(PET.slug.length).toBeGreaterThan(0)
    expect(PET.name.length).toBeGreaterThan(0)
  })

  it('has a unique slug for every accessory', () => {
    const slugs = ACCESSORIES.map((accessory) => accessory.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('gives every accessory a positive cost and a valid position rectangle', () => {
    for (const accessory of ACCESSORIES) {
      expect(accessory.cost).toBeGreaterThan(0)
      expect(accessory.xPercent).toBeGreaterThanOrEqual(0)
      expect(accessory.yPercent).toBeGreaterThanOrEqual(0)
      expect(accessory.xPercent + accessory.widthPercent).toBeLessThanOrEqual(100)
    }
  })

  it('has at least 3 starter accessories', () => {
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(3)
  })
})
