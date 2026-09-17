import { getGuestProgress } from './progress'
import { computeLifetimeStars } from '@/lib/game/level-status'
import { ACCESSORIES } from '../../../content/rewards'

const STORAGE_KEY = 'canto-guest-accessories'

export interface GuestAccessoryRow {
  accessorySlug: string
  equipped: boolean
}

export function getGuestAccessories(): GuestAccessoryRow[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function purchaseGuestAccessory(accessorySlug: string): { ok: boolean; accessories: GuestAccessoryRow[] } {
  const owned = getGuestAccessories()

  const accessory = ACCESSORIES.find((candidate) => candidate.slug === accessorySlug)
  if (!accessory || owned.some((row) => row.accessorySlug === accessorySlug)) {
    return { ok: false, accessories: owned }
  }

  const lifetimeStars = computeLifetimeStars(getGuestProgress())
  const spent = owned.reduce((sum, row) => {
    const ownedAccessory = ACCESSORIES.find((candidate) => candidate.slug === row.accessorySlug)
    return sum + (ownedAccessory?.cost ?? 0)
  }, 0)
  const balance = lifetimeStars - spent

  if (balance < accessory.cost) {
    return { ok: false, accessories: owned }
  }

  const updated = [...owned, { accessorySlug, equipped: true }]
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  return { ok: true, accessories: updated }
}

export function setGuestAccessoryEquipped(accessorySlug: string, equipped: boolean): GuestAccessoryRow[] {
  const owned = getGuestAccessories()
  const updated = owned.map((row) => (row.accessorySlug === accessorySlug ? { ...row, equipped } : row))

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  return updated
}

export function clearGuestAccessories(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
