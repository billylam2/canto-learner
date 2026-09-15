import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getProgressForKid, saveLevelProgress } from './progress'

function makeSupabaseMock(overrides: {
  listResult?: { data: unknown; error: unknown }
  maybeSingleResult?: { data: unknown; error: unknown }
  upsertResult?: { error: unknown }
}) {
  const maybeSingle = vi.fn().mockResolvedValue(overrides.maybeSingleResult ?? { data: null, error: null })
  const chain = {
    eq: vi.fn(),
    maybeSingle,
    then: (resolve: (value: unknown) => void) => resolve(overrides.listResult ?? { data: [], error: null }),
  }
  chain.eq.mockReturnValue(chain)
  const select = vi.fn().mockReturnValue(chain)
  const upsert = vi.fn().mockResolvedValue(overrides.upsertResult ?? { error: null })
  const from = vi.fn().mockReturnValue({ select, upsert })
  const supabase = { from } as unknown as SupabaseClient
  return { supabase, upsert }
}

describe('getProgressForKid', () => {
  it('returns mapped progress rows', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: {
        data: [{ level_id: 1, stars_earned: 10, completed_game_types: ['listen-tap'] }],
        error: null,
      },
    })
    const result = await getProgressForKid(supabase, 'kid-1')
    expect(result).toEqual([{ levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] }])
  })

  it('throws when the query errors', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: null, error: { message: 'boom' } } })
    await expect(getProgressForKid(supabase, 'kid-1')).rejects.toThrow(
      'Failed to fetch progress for kid kid-1: boom'
    )
  })
})

describe('saveLevelProgress', () => {
  it('creates a new progress row when none exists', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: null, error: null },
      upsertResult: { error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 12, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kid_id: 'kid-1',
        level_id: 1,
        stars_earned: 12,
        completed_game_types: ['listen-tap'],
      }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('keeps the higher star total on replay', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: { stars_earned: 20, completed_game_types: ['listen-tap'] }, error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 12, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ stars_earned: 20 }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('replaces a lower star total with a new best', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: { stars_earned: 5, completed_game_types: ['listen-tap'] }, error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 18, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ stars_earned: 18 }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('adds a new game type without duplicating existing ones', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: { stars_earned: 5, completed_game_types: ['listen-tap'] }, error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 5, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ completed_game_types: ['listen-tap'] }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('throws when the upsert fails', async () => {
    const { supabase } = makeSupabaseMock({
      maybeSingleResult: { data: null, error: null },
      upsertResult: { error: { message: 'boom' } },
    })
    await expect(saveLevelProgress(supabase, 'kid-1', 1, 5, 'listen-tap')).rejects.toThrow(
      'Failed to save progress: boom'
    )
  })
})
