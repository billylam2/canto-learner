import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  createEpisode: vi.fn(),
}))

import { POST } from './route'
import { createEpisode } from '@/lib/db/dub-sync'

describe('POST /api/dub-sync/episodes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an episode and returns it', async () => {
    vi.mocked(createEpisode).mockResolvedValue({
      id: 'ep-1',
      title: 'Muddy Puddles',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
      cantoContentStart: null,
      cantoContentEnd: null,
      englishContentStart: null,
      englishContentEnd: null,
    })

    const request = new NextRequest('http://localhost/api/dub-sync/episodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Muddy Puddles', cantoneseVideoId: 'canto-123', englishVideoId: 'eng-456' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.episode.id).toBe('ep-1')
    expect(createEpisode).toHaveBeenCalledWith(expect.anything(), {
      title: 'Muddy Puddles',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
    })
  })

  it('rejects a request missing required fields', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Muddy Puddles' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
