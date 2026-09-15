import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertLevel, upsertVocabItem, linkVocabToLevel, getVocabItemsForLevel } from './content'

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

function makeLevelVocabMock(overrides: {
  linksResult?: { data: unknown; error: unknown }
  itemsResult?: { data: unknown; error: unknown }
}) {
  const eq = vi.fn().mockResolvedValue(overrides.linksResult ?? { data: [], error: null })
  const levelVocabSelect = vi.fn().mockReturnValue({ eq })

  const order = vi.fn().mockResolvedValue(overrides.itemsResult ?? { data: [], error: null })
  const inFn = vi.fn().mockReturnValue({ order })
  const vocabItemsSelect = vi.fn().mockReturnValue({ in: inFn })

  const from = vi.fn((table: string) => {
    if (table === 'level_vocab') return { select: levelVocabSelect }
    if (table === 'vocab_items') return { select: vocabItemsSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from } as unknown as SupabaseClient
}

describe('getVocabItemsForLevel', () => {
  it('returns vocab items mapped to camelCase, in database order', async () => {
    const supabase = makeLevelVocabMock({
      linksResult: { data: [{ vocab_item_id: 'v1' }, { vocab_item_id: 'v2' }], error: null },
      itemsResult: {
        data: [
          { id: 'v1', slug: 'hello', audio_url: 'a1', image_url: 'i1', homophone_group: null },
          { id: 'v2', slug: 'goodbye', audio_url: 'a2', image_url: 'i2', homophone_group: null },
        ],
        error: null,
      },
    })

    const result = await getVocabItemsForLevel(supabase, 1)
    expect(result).toEqual([
      { id: 'v1', slug: 'hello', audioUrl: 'a1', imageUrl: 'i1', homophoneGroup: null },
      { id: 'v2', slug: 'goodbye', audioUrl: 'a2', imageUrl: 'i2', homophoneGroup: null },
    ])
  })

  it('returns an empty array when the level has no vocab', async () => {
    const supabase = makeLevelVocabMock({ linksResult: { data: [], error: null } })
    const result = await getVocabItemsForLevel(supabase, 999)
    expect(result).toEqual([])
  })

  it('throws when the level_vocab query errors', async () => {
    const supabase = makeLevelVocabMock({ linksResult: { data: null, error: { message: 'boom' } } })
    await expect(getVocabItemsForLevel(supabase, 1)).rejects.toThrow(
      'Failed to fetch level_vocab for level 1: boom'
    )
  })

  it('throws when the vocab_items query errors', async () => {
    const supabase = makeLevelVocabMock({
      linksResult: { data: [{ vocab_item_id: 'v1' }], error: null },
      itemsResult: { data: null, error: { message: 'boom' } },
    })
    await expect(getVocabItemsForLevel(supabase, 1)).rejects.toThrow(
      'Failed to fetch vocab items for level 1: boom'
    )
  })
})
