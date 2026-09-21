import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createEpisode, listEpisodes, getEpisode, updateEpisodeAnchors } from './dub-sync'

const episodeRow = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantonese_video_id: 'canto-123',
  english_video_id: 'eng-456',
  canto_content_start: null,
  canto_content_end: null,
  english_content_start: null,
  english_content_end: null,
}

function makeSingleMock(overrides: { single?: { data: unknown; error: unknown } }) {
  const single = vi.fn().mockResolvedValue(overrides.single ?? { data: episodeRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ insert, update })
  return { from } as unknown as SupabaseClient
}

describe('createEpisode', () => {
  it('returns the created episode mapped to camelCase', async () => {
    const supabase = makeSingleMock({})
    const result = await createEpisode(supabase, {
      title: 'Muddy Puddles',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
    })
    expect(result).toEqual({
      id: 'ep-1',
      title: 'Muddy Puddles',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
      cantoContentStart: null,
      cantoContentEnd: null,
      englishContentStart: null,
      englishContentEnd: null,
    })
  })

  it('throws when the insert fails', async () => {
    const supabase = makeSingleMock({ single: { data: null, error: { message: 'boom' } } })
    await expect(
      createEpisode(supabase, { title: 'X', cantoneseVideoId: 'a', englishVideoId: 'b' })
    ).rejects.toThrow('Failed to create episode X: boom')
  })
})

function makeListMock(overrides: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(overrides)
  const select = vi.fn().mockReturnValue({ order })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe('listEpisodes', () => {
  it('returns all episodes mapped to camelCase', async () => {
    const supabase = makeListMock({ data: [episodeRow], error: null })
    const result = await listEpisodes(supabase)
    expect(result).toEqual([
      {
        id: 'ep-1',
        title: 'Muddy Puddles',
        cantoneseVideoId: 'canto-123',
        englishVideoId: 'eng-456',
        cantoContentStart: null,
        cantoContentEnd: null,
        englishContentStart: null,
        englishContentEnd: null,
      },
    ])
  })

  it('throws when the query fails', async () => {
    const supabase = makeListMock({ data: null, error: { message: 'boom' } })
    await expect(listEpisodes(supabase)).rejects.toThrow('Failed to list episodes: boom')
  })
})

function makeGetMock(overrides: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(overrides)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe('getEpisode', () => {
  it('returns the episode when found', async () => {
    const supabase = makeGetMock({ data: episodeRow, error: null })
    const result = await getEpisode(supabase, 'ep-1')
    expect(result?.id).toBe('ep-1')
  })

  it('returns null when not found', async () => {
    const supabase = makeGetMock({ data: null, error: null })
    const result = await getEpisode(supabase, 'missing')
    expect(result).toBeNull()
  })

  it('throws when the query fails', async () => {
    const supabase = makeGetMock({ data: null, error: { message: 'boom' } })
    await expect(getEpisode(supabase, 'ep-1')).rejects.toThrow('Failed to fetch episode ep-1: boom')
  })
})

describe('updateEpisodeAnchors', () => {
  it('returns the updated episode', async () => {
    const supabase = makeSingleMock({
      single: {
        data: {
          ...episodeRow,
          canto_content_start: 10,
          canto_content_end: 110,
          english_content_start: 20,
          english_content_end: 220,
        },
        error: null,
      },
    })
    const result = await updateEpisodeAnchors(supabase, 'ep-1', {
      cantoContentStart: 10,
      cantoContentEnd: 110,
      englishContentStart: 20,
      englishContentEnd: 220,
    })
    expect(result.cantoContentStart).toBe(10)
    expect(result.englishContentEnd).toBe(220)
  })

  it('throws when the update fails', async () => {
    const supabase = makeSingleMock({ single: { data: null, error: { message: 'boom' } } })
    await expect(
      updateEpisodeAnchors(supabase, 'ep-1', {
        cantoContentStart: 10,
        cantoContentEnd: 110,
        englishContentStart: 20,
        englishContentEnd: 220,
      })
    ).rejects.toThrow('Failed to update anchors for episode ep-1: boom')
  })
})
