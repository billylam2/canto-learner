import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccessoriesForKid, purchaseAccessory, setAccessoryEquipped } from './accessories'
import { getProgressForKid } from './progress'

vi.mock('./progress', () => ({
  getProgressForKid: vi.fn(),
}))

function makeSupabaseMock(overrides: {
  listResult?: { data: unknown; error: unknown }
  insertResult?: { error: unknown }
  updateResult?: { error: unknown }
}) {
  const selectChain = {
    eq: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve(overrides.listResult ?? { data: [], error: null }),
  }
  selectChain.eq.mockReturnValue(selectChain)
  const select = vi.fn().mockReturnValue(selectChain)

  const updateChain = {
    eq: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve(overrides.updateResult ?? { error: null }),
  }
  updateChain.eq.mockReturnValue(updateChain)
  const update = vi.fn().mockReturnValue(updateChain)

  const insert = vi.fn().mockResolvedValue(overrides.insertResult ?? { error: null })

  const from = vi.fn().mockReturnValue({ select, insert, update })
  const supabase = { from } as unknown as SupabaseClient
  return { supabase, insert, update }
}

describe('getAccessoriesForKid', () => {
  it('returns mapped accessory rows', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
    })
    const result = await getAccessoriesForKid(supabase, 'kid-1')
    expect(result).toEqual([{ accessorySlug: 'bow', equipped: true }])
  })

  it('throws when the query errors', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: null, error: { message: 'boom' } } })
    await expect(getAccessoriesForKid(supabase, 'kid-1')).rejects.toThrow(
      'Failed to fetch accessories for kid kid-1: boom'
    )
  })
})

describe('purchaseAccessory', () => {
  beforeEach(() => {
    vi.mocked(getProgressForKid).mockReset()
  })

  it('inserts a new row when the kid can afford it', async () => {
    const { supabase, insert } = makeSupabaseMock({ listResult: { data: [], error: null } })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await purchaseAccessory(supabase, 'kid-1', 'bow')

    expect(insert).toHaveBeenCalledWith({ kid_id: 'kid-1', accessory_slug: 'bow', equipped: true })
  })

  it('throws when the kid already owns the accessory', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
    })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow('already owns')
  })

  it('throws when the kid cannot afford the accessory', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: [], error: null } })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 2, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow('cannot afford')
  })

  it('subtracts the cost of already-owned accessories from the available balance', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'party-hat', equipped: true }], error: null },
    })
    // party-hat costs 20; with 24 lifetime stars only 4 remain, not enough for bow (10)
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow('cannot afford')
  })

  it('throws when the accessory slug is unknown', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: [], error: null } })
    await expect(purchaseAccessory(supabase, 'kid-1', 'not-a-real-slug')).rejects.toThrow('Unknown accessory')
  })

  it('throws when the insert fails', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [], error: null },
      insertResult: { error: { message: 'boom' } },
    })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow(
      'Failed to purchase accessory bow: boom'
    )
  })
})

describe('setAccessoryEquipped', () => {
  it('updates the equipped flag when the kid owns the accessory', async () => {
    const { supabase, update } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
    })

    await setAccessoryEquipped(supabase, 'kid-1', 'bow', false)

    expect(update).toHaveBeenCalledWith({ equipped: false })
  })

  it('throws when the kid does not own the accessory', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: [], error: null } })
    await expect(setAccessoryEquipped(supabase, 'kid-1', 'bow', false)).rejects.toThrow('does not own')
  })

  it('throws when the update fails', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
      updateResult: { error: { message: 'boom' } },
    })
    await expect(setAccessoryEquipped(supabase, 'kid-1', 'bow', false)).rejects.toThrow(
      'Failed to update accessory bow: boom'
    )
  })
})
