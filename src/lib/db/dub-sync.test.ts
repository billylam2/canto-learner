import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createEpisode,
  listEpisodes,
  getEpisode,
  updateEpisodeAnchors,
  createSegment,
  createSegmentsBulk,
  listSegments,
  updateSegment,
  deleteSegment,
  replaceCantoWords,
  listCantoWords,
} from './dub-sync'

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

const segmentRow = {
  id: 'seg-1',
  episode_id: 'ep-1',
  position: 0,
  label: 'Peppa says hello',
  canto_start: 12.5,
  canto_end: 15.0,
  english_start: 10.0,
  english_end: 13.2,
}

function makeNextPositionMock(existingPositions: number[]) {
  const limit = vi.fn().mockResolvedValue({ data: existingPositions.map((position) => ({ position })), error: null })
  const order = vi.fn().mockReturnValue({ limit })
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  return { select }
}

function makeCreateSegmentMock(overrides: { single?: { data: unknown; error: unknown } }, existingPositions: number[] = []) {
  const single = vi.fn().mockResolvedValue(overrides.single ?? { data: segmentRow, error: null })
  const insertSelect = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select: insertSelect })
  const nextPositionQuery = makeNextPositionMock(existingPositions)
  const from = vi.fn().mockReturnValue({ insert, select: nextPositionQuery.select })
  return { from } as unknown as SupabaseClient
}

describe('createSegment', () => {
  it('creates a segment at the next position and returns it mapped to camelCase', async () => {
    const supabase = makeCreateSegmentMock({}, [])
    const result = await createSegment(supabase, 'ep-1', {
      label: 'Peppa says hello',
      cantoStart: 12.5,
      cantoEnd: 15.0,
      englishStart: 10.0,
      englishEnd: 13.2,
    })
    expect(result).toEqual({
      id: 'seg-1',
      episodeId: 'ep-1',
      position: 0,
      label: 'Peppa says hello',
      cantoStart: 12.5,
      cantoEnd: 15.0,
      englishStart: 10.0,
      englishEnd: 13.2,
    })
  })

  it('throws when the insert fails', async () => {
    const supabase = makeCreateSegmentMock({ single: { data: null, error: { message: 'boom' } } }, [])
    await expect(
      createSegment(supabase, 'ep-1', { cantoStart: 1, cantoEnd: 2, englishStart: 1, englishEnd: 2 })
    ).rejects.toThrow('Failed to create segment for episode ep-1: boom')
  })
})

function makeBulkMock(insertResult: { data: unknown; error: unknown }, existingPositions: number[] = []) {
  const insertSelect = vi.fn().mockResolvedValue(insertResult)
  const insert = vi.fn().mockReturnValue({ select: insertSelect })
  const nextPositionQuery = makeNextPositionMock(existingPositions)
  const from = vi.fn().mockReturnValue({ insert, select: nextPositionQuery.select })
  return { from } as unknown as SupabaseClient
}

describe('createSegmentsBulk', () => {
  it('returns an empty array for an empty input', async () => {
    const supabase = makeBulkMock({ data: [], error: null })
    const result = await createSegmentsBulk(supabase, 'ep-1', [])
    expect(result).toEqual([])
  })

  it('creates multiple segments starting after the existing max position', async () => {
    const supabase = makeBulkMock(
      { data: [segmentRow, { ...segmentRow, id: 'seg-2', position: 1 }], error: null },
      [0]
    )
    const result = await createSegmentsBulk(supabase, 'ep-1', [
      { cantoStart: 12.5, cantoEnd: 15.0, englishStart: 10.0, englishEnd: 13.2 },
      { cantoStart: 16.0, cantoEnd: 18.0, englishStart: 14.0, englishEnd: 16.0 },
    ])
    expect(result).toHaveLength(2)
    expect(result[1].position).toBe(1)
  })

  it('throws when the bulk insert fails', async () => {
    const supabase = makeBulkMock({ data: null, error: { message: 'boom' } })
    await expect(
      createSegmentsBulk(supabase, 'ep-1', [{ cantoStart: 1, cantoEnd: 2, englishStart: 1, englishEnd: 2 }])
    ).rejects.toThrow('Failed to bulk-create segments for episode ep-1: boom')
  })
})

function makeListSegmentsMock(overrides: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(overrides)
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe('listSegments', () => {
  it('returns segments ordered by position', async () => {
    const supabase = makeListSegmentsMock({ data: [segmentRow], error: null })
    const result = await listSegments(supabase, 'ep-1')
    expect(result).toEqual([
      {
        id: 'seg-1',
        episodeId: 'ep-1',
        position: 0,
        label: 'Peppa says hello',
        cantoStart: 12.5,
        cantoEnd: 15.0,
        englishStart: 10.0,
        englishEnd: 13.2,
      },
    ])
  })

  it('throws when the query fails', async () => {
    const supabase = makeListSegmentsMock({ data: null, error: { message: 'boom' } })
    await expect(listSegments(supabase, 'ep-1')).rejects.toThrow('Failed to list segments for episode ep-1: boom')
  })
})

function makeUpdateSegmentMock(overrides: { single?: { data: unknown; error: unknown } }) {
  const single = vi.fn().mockResolvedValue(overrides.single ?? { data: segmentRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { from } as unknown as SupabaseClient
}

describe('updateSegment', () => {
  it('returns the updated segment', async () => {
    const supabase = makeUpdateSegmentMock({ single: { data: { ...segmentRow, canto_end: 16.0 }, error: null } })
    const result = await updateSegment(supabase, 'seg-1', { cantoEnd: 16.0 })
    expect(result.cantoEnd).toBe(16.0)
  })

  it('throws when the update fails', async () => {
    const supabase = makeUpdateSegmentMock({ single: { data: null, error: { message: 'boom' } } })
    await expect(updateSegment(supabase, 'seg-1', { cantoEnd: 16.0 })).rejects.toThrow(
      'Failed to update segment seg-1: boom'
    )
  })
})

function makeDeleteSegmentMock(overrides: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(overrides)
  const del = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ delete: del })
  return { from } as unknown as SupabaseClient
}

describe('deleteSegment', () => {
  it('resolves when the delete succeeds', async () => {
    const supabase = makeDeleteSegmentMock({ error: null })
    await expect(deleteSegment(supabase, 'seg-1')).resolves.toBeUndefined()
  })

  it('throws when the delete fails', async () => {
    const supabase = makeDeleteSegmentMock({ error: { message: 'boom' } })
    await expect(deleteSegment(supabase, 'seg-1')).rejects.toThrow('Failed to delete segment seg-1: boom')
  })
})

function makeReplaceCantoWordsMock(
  deleteResult: { error: unknown },
  insertResult: { data: unknown; error: unknown }
) {
  const deleteEq = vi.fn().mockResolvedValue(deleteResult)
  const del = vi.fn().mockReturnValue({ eq: deleteEq })
  const insertSelect = vi.fn().mockResolvedValue(insertResult)
  const insert = vi.fn().mockReturnValue({ select: insertSelect })
  const from = vi.fn().mockReturnValue({ delete: del, insert })
  return { from } as unknown as SupabaseClient
}

describe('replaceCantoWords', () => {
  it('deletes existing words and inserts the new set, mapped to camelCase', async () => {
    const supabase = makeReplaceCantoWordsMock(
      { error: null },
      {
        data: [
          { id: 'w-1', episode_id: 'ep-1', text: '你好', start_time: 1.2, end_time: 1.6 },
          { id: 'w-2', episode_id: 'ep-1', text: '喬治', start_time: 2.0, end_time: 2.4 },
        ],
        error: null,
      }
    )
    const result = await replaceCantoWords(supabase, 'ep-1', [
      { text: '你好', startTime: 1.2, endTime: 1.6 },
      { text: '喬治', startTime: 2.0, endTime: 2.4 },
    ])
    expect(result).toEqual([
      { id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1.2, endTime: 1.6 },
      { id: 'w-2', episodeId: 'ep-1', text: '喬治', startTime: 2.0, endTime: 2.4 },
    ])
  })

  it('returns an empty array without inserting when given no words', async () => {
    const supabase = makeReplaceCantoWordsMock({ error: null }, { data: [], error: null })
    const result = await replaceCantoWords(supabase, 'ep-1', [])
    expect(result).toEqual([])
  })

  it('throws when the delete fails', async () => {
    const supabase = makeReplaceCantoWordsMock({ error: { message: 'boom' } }, { data: [], error: null })
    await expect(
      replaceCantoWords(supabase, 'ep-1', [{ text: 'hi', startTime: 0, endTime: 1 }])
    ).rejects.toThrow('Failed to clear existing canto words for episode ep-1: boom')
  })

  it('throws when the insert fails', async () => {
    const supabase = makeReplaceCantoWordsMock({ error: null }, { data: null, error: { message: 'boom' } })
    await expect(
      replaceCantoWords(supabase, 'ep-1', [{ text: 'hi', startTime: 0, endTime: 1 }])
    ).rejects.toThrow('Failed to save canto words for episode ep-1: boom')
  })
})

function makeListCantoWordsMock(overrides: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(overrides)
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe('listCantoWords', () => {
  it('returns words ordered by start time', async () => {
    const supabase = makeListCantoWordsMock({
      data: [{ id: 'w-1', episode_id: 'ep-1', text: '你好', start_time: 1.2, end_time: 1.6 }],
      error: null,
    })
    const result = await listCantoWords(supabase, 'ep-1')
    expect(result).toEqual([{ id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1.2, endTime: 1.6 }])
  })

  it('throws when the query fails', async () => {
    const supabase = makeListCantoWordsMock({ data: null, error: { message: 'boom' } })
    await expect(listCantoWords(supabase, 'ep-1')).rejects.toThrow(
      'Failed to list canto words for episode ep-1: boom'
    )
  })
})
