import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  updateEpisodeAnchors: vi.fn(),
}))

import { PATCH } from './route'
import { updateEpisodeAnchors } from '@/lib/db/dub-sync'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('PATCH /api/dub-sync/episodes/[episodeId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the episode anchors', async () => {
    vi.mocked(updateEpisodeAnchors).mockResolvedValue({
      id: 'ep-1',
      title: 'Muddy Puddles',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
      cantoContentStart: 10,
      cantoContentEnd: 110,
      englishContentStart: 20,
      englishContentEnd: 220,
    })

    const response = await PATCH(
      makeRequest({ cantoContentStart: 10, cantoContentEnd: 110, englishContentStart: 20, englishContentEnd: 220 }),
      { params: Promise.resolve({ episodeId: 'ep-1' }) }
    )

    expect(response.status).toBe(200)
    expect(updateEpisodeAnchors).toHaveBeenCalledWith(expect.anything(), 'ep-1', {
      cantoContentStart: 10,
      cantoContentEnd: 110,
      englishContentStart: 20,
      englishContentEnd: 220,
    })
  })

  it('rejects a request missing an anchor field', async () => {
    const response = await PATCH(makeRequest({ cantoContentStart: 10 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })
    expect(response.status).toBe(400)
  })
})
