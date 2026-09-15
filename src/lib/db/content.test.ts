import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertLevel, upsertVocabItem, linkVocabToLevel } from './content'

function makeSupabaseMock(overrides: {
  upsertResult?: { error: unknown }
  singleResult?: { data: unknown; error: unknown }
}) {
  const single = vi.fn().mockResolvedValue(overrides.singleResult ?? { data: null, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const upsert = vi.fn().mockReturnValue({
    select,
    then: (resolve: (value: { error: unknown }) => void) =>
      resolve(overrides.upsertResult ?? { error: null }),
  })
  const from = vi.fn().mockReturnValue({ upsert })
  return { from } as unknown as SupabaseClient
}

describe('upsertLevel', () => {
  it('resolves when the upsert succeeds', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: null } })
    await expect(
      upsertLevel(supabase, { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 })
    ).resolves.toBeUndefined()
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: { message: 'boom' } } })
    await expect(
      upsertLevel(supabase, { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 })
    ).rejects.toThrow('Failed to upsert level 1: boom')
  })
})

describe('upsertVocabItem', () => {
  it('returns the upserted item id', async () => {
    const supabase = makeSupabaseMock({ singleResult: { data: { id: 'v1' }, error: null } })
    const result = await upsertVocabItem(supabase, {
      slug: 'hello',
      category: 'greetings',
      cantoneseText: '你好',
      jyutping: 'nei5 hou2',
      englishGloss: 'hello',
      homophoneGroup: null,
      audioUrl: 'https://example.com/hello.mp3',
      imageUrl: 'https://example.com/hello.svg',
    })
    expect(result).toEqual({ id: 'v1' })
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeSupabaseMock({ singleResult: { data: null, error: { message: 'dup' } } })
    await expect(
      upsertVocabItem(supabase, {
        slug: 'hello',
        category: 'greetings',
        cantoneseText: '你好',
        jyutping: 'nei5 hou2',
        englishGloss: 'hello',
        homophoneGroup: null,
        audioUrl: 'https://example.com/hello.mp3',
        imageUrl: 'https://example.com/hello.svg',
      })
    ).rejects.toThrow('Failed to upsert vocab item hello: dup')
  })
})

describe('linkVocabToLevel', () => {
  it('resolves when the upsert succeeds', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: null } })
    await expect(linkVocabToLevel(supabase, 1, 'v1')).resolves.toBeUndefined()
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: { message: 'boom' } } })
    await expect(linkVocabToLevel(supabase, 1, 'v1')).rejects.toThrow(
      'Failed to link vocab item v1 to level 1: boom'
    )
  })
})
