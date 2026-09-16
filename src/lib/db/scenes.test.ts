import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertScene, upsertSceneObject, getScenesForLevel } from './scenes'

function makeUpsertMock(overrides: {
  upsertResult?: { error: unknown }
  singleResult?: { data: unknown; error: unknown }
}) {
  const single = vi.fn().mockResolvedValue(overrides.singleResult ?? { data: null, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const upsert = vi.fn().mockReturnValue({
    select,
    then: (resolve: (value: { error: unknown }) => void) => resolve(overrides.upsertResult ?? { error: null }),
  })
  const from = vi.fn().mockReturnValue({ upsert })
  return { from } as unknown as SupabaseClient
}

describe('upsertScene', () => {
  it('returns the upserted scene id', async () => {
    const supabase = makeUpsertMock({ singleResult: { data: { id: 1 }, error: null } })
    const result = await upsertScene(supabase, {
      slug: 'scene-dog-cat',
      levelId: 3,
      name: 'Dog and Cat',
      imageUrl: 'https://example.com/scene-dog-cat.png',
    })
    expect(result).toEqual({ id: 1 })
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeUpsertMock({ singleResult: { data: null, error: { message: 'boom' } } })
    await expect(
      upsertScene(supabase, {
        slug: 'scene-dog-cat',
        levelId: 3,
        name: 'Dog and Cat',
        imageUrl: 'https://example.com/scene-dog-cat.png',
      })
    ).rejects.toThrow('Failed to upsert scene scene-dog-cat: boom')
  })
})

describe('upsertSceneObject', () => {
  it('resolves when the upsert succeeds', async () => {
    const supabase = makeUpsertMock({ upsertResult: { error: null } })
    await expect(
      upsertSceneObject(supabase, {
        sceneId: 1,
        vocabItemId: 'v1',
        xPercent: 10,
        yPercent: 10,
        widthPercent: 20,
        heightPercent: 20,
      })
    ).resolves.toBeUndefined()
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeUpsertMock({ upsertResult: { error: { message: 'boom' } } })
    await expect(
      upsertSceneObject(supabase, {
        sceneId: 1,
        vocabItemId: 'v1',
        xPercent: 10,
        yPercent: 10,
        widthPercent: 20,
        heightPercent: 20,
      })
    ).rejects.toThrow('Failed to upsert scene object for scene 1: boom')
  })
})

function makeScenesQueryMock(overrides: {
  scenesResult?: { data: unknown; error: unknown }
  objectsResult?: { data: unknown; error: unknown }
}) {
  const scenesOrder = vi.fn().mockResolvedValue(overrides.scenesResult ?? { data: [], error: null })
  const scenesEq = vi.fn().mockReturnValue({ order: scenesOrder })
  const scenesSelect = vi.fn().mockReturnValue({ eq: scenesEq })

  const objectsOrder = vi.fn().mockResolvedValue(overrides.objectsResult ?? { data: [], error: null })
  const objectsEq = vi.fn().mockReturnValue({ order: objectsOrder })
  const objectsSelect = vi.fn().mockReturnValue({ eq: objectsEq })

  const from = vi.fn((table: string) => {
    if (table === 'scenes') return { select: scenesSelect }
    if (table === 'scene_objects') return { select: objectsSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from } as unknown as SupabaseClient
}

describe('getScenesForLevel', () => {
  it('returns scenes with their objects mapped to camelCase', async () => {
    const supabase = makeScenesQueryMock({
      scenesResult: { data: [{ id: 1, image_url: 'https://example.com/scene-1.png' }], error: null },
      objectsResult: {
        data: [
          {
            x_percent: 10,
            y_percent: 10,
            width_percent: 20,
            height_percent: 20,
            vocab_items: { id: 'v1', slug: 'dog', audio_url: 'https://example.com/dog.mp3' },
          },
        ],
        error: null,
      },
    })

    const result = await getScenesForLevel(supabase, 3)
    expect(result).toEqual([
      {
        id: 1,
        imageUrl: 'https://example.com/scene-1.png',
        objects: [
          {
            id: 'v1',
            slug: 'dog',
            audioUrl: 'https://example.com/dog.mp3',
            xPercent: 10,
            yPercent: 10,
            widthPercent: 20,
            heightPercent: 20,
          },
        ],
      },
    ])
  })

  it('returns an empty array when the level has no scenes', async () => {
    const supabase = makeScenesQueryMock({ scenesResult: { data: [], error: null } })
    const result = await getScenesForLevel(supabase, 1)
    expect(result).toEqual([])
  })

  it('throws when the scenes query errors', async () => {
    const supabase = makeScenesQueryMock({ scenesResult: { data: null, error: { message: 'boom' } } })
    await expect(getScenesForLevel(supabase, 3)).rejects.toThrow('Failed to fetch scenes for level 3: boom')
  })

  it('throws when the scene_objects query errors', async () => {
    const supabase = makeScenesQueryMock({
      scenesResult: { data: [{ id: 1, image_url: 'https://example.com/scene-1.png' }], error: null },
      objectsResult: { data: null, error: { message: 'boom' } },
    })
    await expect(getScenesForLevel(supabase, 3)).rejects.toThrow('Failed to fetch scene objects for scene 1: boom')
  })
})
