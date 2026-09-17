import { describe, it, expect, beforeEach } from 'vitest'
import { getGuestAccessories, purchaseGuestAccessory, setGuestAccessoryEquipped, clearGuestAccessories } from './accessories'
import { saveGuestLevelProgress } from './progress'

describe('getGuestAccessories', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns an empty array when nothing is stored', () => {
    expect(getGuestAccessories()).toEqual([])
  })

  it('returns an empty array for unparseable stored data', () => {
    window.localStorage.setItem('canto-guest-accessories', 'not json')
    expect(getGuestAccessories()).toEqual([])
  })
})

describe('purchaseGuestAccessory', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('purchases when the guest can afford it', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    const result = purchaseGuestAccessory('bow')
    expect(result.ok).toBe(true)
    expect(result.accessories).toEqual([{ accessorySlug: 'bow', equipped: true }])
  })

  it('fails when the guest cannot afford it', () => {
    saveGuestLevelProgress(1, 2, 'listen-tap')
    const result = purchaseGuestAccessory('bow')
    expect(result.ok).toBe(false)
    expect(result.accessories).toEqual([])
  })

  it('fails when the guest already owns the accessory', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    const result = purchaseGuestAccessory('bow')
    expect(result.ok).toBe(false)
  })

  it('fails for an unknown accessory slug', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    const result = purchaseGuestAccessory('not-a-real-slug')
    expect(result.ok).toBe(false)
  })

  it('persists across calls to getGuestAccessories', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    expect(getGuestAccessories()).toEqual([{ accessorySlug: 'bow', equipped: true }])
  })
})

describe('setGuestAccessoryEquipped', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('toggles the equipped flag for an owned accessory', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    const result = setGuestAccessoryEquipped('bow', false)
    expect(result).toEqual([{ accessorySlug: 'bow', equipped: false }])
  })
})

describe('clearGuestAccessories', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('removes previously purchased accessories', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    clearGuestAccessories()
    expect(getGuestAccessories()).toEqual([])
  })
})
