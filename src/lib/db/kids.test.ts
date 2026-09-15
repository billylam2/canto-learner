import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findKidByUsername, createKid } from './kids'

function makeSupabaseMock(overrides: {
  maybeSingleResult?: { data: unknown; error: unknown }
  singleResult?: { data: unknown; error: unknown }
}): SupabaseClient {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue(overrides.maybeSingleResult ?? { data: null, error: null })
  const single = vi.fn().mockResolvedValue(overrides.singleResult ?? { data: null, error: null })
  const ilike = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ ilike, single })
  const insert = vi.fn().mockReturnValue({ select })
  const from = vi.fn().mockReturnValue({ select, insert })
  return { from } as unknown as SupabaseClient
}

describe('findKidByUsername', () => {
  it('returns the kid when found', async () => {
    const supabase = makeSupabaseMock({
      maybeSingleResult: {
        data: { id: '1', username: 'mimi', pin_hash: 'hash', failed_login_attempts: 0, locked_until: null },
        error: null,
      },
    })
    const kid = await findKidByUsername(supabase, 'mimi')
    expect(kid?.username).toBe('mimi')
  })

  it('returns null when not found', async () => {
    const supabase = makeSupabaseMock({ maybeSingleResult: { data: null, error: null } })
    const kid = await findKidByUsername(supabase, 'nobody')
    expect(kid).toBeNull()
  })

  it('throws when the query errors', async () => {
    const supabase = makeSupabaseMock({
      maybeSingleResult: { data: null, error: { message: 'boom' } },
    })
    await expect(findKidByUsername(supabase, 'mimi')).rejects.toThrow('Failed to look up kid: boom')
  })
})

describe('createKid', () => {
  it('returns the created kid', async () => {
    const supabase = makeSupabaseMock({
      singleResult: { data: { id: '2', username: 'kobe' }, error: null },
    })
    const kid = await createKid(supabase, 'kobe', 'hash')
    expect(kid).toEqual({ id: '2', username: 'kobe' })
  })

  it('throws when insert fails', async () => {
    const supabase = makeSupabaseMock({ singleResult: { data: null, error: { message: 'dup' } } })
    await expect(createKid(supabase, 'kobe', 'hash')).rejects.toThrow('Failed to create kid: dup')
  })
})
