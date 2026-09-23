import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
}))

vi.mock('@/lib/dub-sync/refine-alignment', () => ({
  refineAlignment: vi.fn(),
}))

vi.mock('@/lib/dub-sync/extract-clip-hashes', () => ({
  extractClipHashes: vi.fn(),
}))

import { POST } from './route'
import { getEpisode } from '@/lib/db/dub-sync'
import { refineAlignment } from '@/lib/dub-sync/refine-alignment'

const episodeWithAnchors = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: 15.7394,
  cantoContentEnd: 286.273,
  englishContentStart: 14.7089,
  englishContentEnd: 285.344,
}

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/refine-alignment', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/refine-alignment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the suggested alignment for both start and end when both ends are marked', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(refineAlignment).mockImplementation(async ({ cantoTime }) =>
      cantoTime === 15.7394
        ? { suggestedEnglishTime: 14.8089, offsetSeconds: 0.1, avgDistance: 2.24, confident: true }
        : { suggestedEnglishTime: 285.5, offsetSeconds: 0.156, avgDistance: 3.1, confident: true }
    )

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      suggestedEnglishContentStart: 14.8089,
      startOffsetSeconds: 0.1,
      startAvgDistance: 2.24,
      startConfident: true,
      suggestedEnglishContentEnd: 285.5,
      endOffsetSeconds: 0.156,
      endAvgDistance: 3.1,
      endConfident: true,
    })
    expect(refineAlignment).toHaveBeenCalledWith(
      {
        cantoneseVideoId: 'canto-123',
        englishVideoId: 'eng-456',
        cantoTime: 15.7394,
        englishTime: 14.7089,
      },
      expect.objectContaining({ extractClipHashes: expect.any(Function) })
    )
    expect(refineAlignment).toHaveBeenCalledWith(
      {
        cantoneseVideoId: 'canto-123',
        englishVideoId: 'eng-456',
        cantoTime: 286.273,
        englishTime: 285.344,
      },
      expect.objectContaining({ extractClipHashes: expect.any(Function) })
    )
  })

  it('only refines start when the content-end marks are not both set yet', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...episodeWithAnchors, englishContentEnd: null })
    vi.mocked(refineAlignment).mockResolvedValue({
      suggestedEnglishTime: 14.8089,
      offsetSeconds: 0.1,
      avgDistance: 2.24,
      confident: true,
    })

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.suggestedEnglishContentEnd).toBeNull()
    expect(refineAlignment).toHaveBeenCalledTimes(1)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 400 when content-start anchors are not both set', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...episodeWithAnchors, englishContentStart: null })
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(400)
  })

  it('returns 502 when alignment fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(refineAlignment).mockRejectedValue(new Error('yt-dlp exited with code 1'))
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('yt-dlp')
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/refine-alignment', {
      method: 'POST',
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
