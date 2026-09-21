import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  createSegmentsBulk: vi.fn(),
}))

vi.mock('@/lib/dub-sync/captions', () => ({
  fetchCantoneseCaptionCues: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, createSegmentsBulk } from '@/lib/db/dub-sync'
import { fetchCantoneseCaptionCues } from '@/lib/dub-sync/captions'

const episodeWithAnchors = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/generate-segments', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/generate-segments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('generates and bulk-creates candidate segments from captions', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(fetchCantoneseCaptionCues).mockResolvedValue([{ start: 10, end: 20, text: '你好' }])
    vi.mocked(createSegmentsBulk).mockResolvedValue([
      {
        id: 'seg-1',
        episodeId: 'ep-1',
        position: 0,
        label: null,
        cantoStart: 10,
        cantoEnd: 20,
        englishStart: 20,
        englishEnd: 40,
      },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    expect(createSegmentsBulk).toHaveBeenCalledWith(expect.anything(), 'ep-1', [
      { cantoStart: 10, cantoEnd: 20, englishStart: 20, englishEnd: 40 },
    ])
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 400 when anchors are not fully set', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...episodeWithAnchors, englishContentEnd: null })
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(400)
  })

  it('returns 502 when caption fetching fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(fetchCantoneseCaptionCues).mockRejectedValue(new Error('no captions'))
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(502)
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/generate-segments', {
      method: 'POST',
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
