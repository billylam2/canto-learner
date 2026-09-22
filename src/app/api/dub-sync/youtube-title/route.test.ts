import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/dub-sync/youtube-title', () => ({
  fetchYoutubeTitle: vi.fn(),
}))

import { GET } from './route'
import { fetchYoutubeTitle } from '@/lib/dub-sync/youtube-title'

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(videoId: string | null): Promise<NextRequest> {
  const url = new URL('http://localhost/api/dub-sync/youtube-title')
  if (videoId !== null) url.searchParams.set('videoId', videoId)
  return new NextRequest(url, { headers: { cookie: await adminCookieHeader() } })
}

describe('GET /api/dub-sync/youtube-title', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the fetched title', async () => {
    vi.mocked(fetchYoutubeTitle).mockResolvedValue('Muddy Puddles')

    const response = await GET(await makeRequest('video-1'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.title).toBe('Muddy Puddles')
    expect(fetchYoutubeTitle).toHaveBeenCalledWith('video-1')
  })

  it('rejects an unauthenticated request', async () => {
    const url = new URL('http://localhost/api/dub-sync/youtube-title')
    url.searchParams.set('videoId', 'video-1')
    const request = new NextRequest(url)

    const response = await GET(request)

    expect(response.status).toBe(401)
  })

  it('returns 400 when videoId is missing', async () => {
    const response = await GET(await makeRequest(null))
    expect(response.status).toBe(400)
  })

  it('returns 502 when the title fetch fails', async () => {
    vi.mocked(fetchYoutubeTitle).mockRejectedValue(new Error('request failed with status 404'))

    const response = await GET(await makeRequest('missing-video'))

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('request failed with status 404')
  })
})
