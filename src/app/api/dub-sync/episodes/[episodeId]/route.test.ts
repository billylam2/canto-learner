import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  updateEpisodeAnchors: vi.fn(),
  updateEpisodeTitle: vi.fn(),
}))

import { PATCH } from './route'
import { updateEpisodeAnchors, updateEpisodeTitle } from '@/lib/db/dub-sync'

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
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
      await makeRequest({ cantoContentStart: 10, cantoContentEnd: 110, englishContentStart: 20, englishContentEnd: 220 }),
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
    const response = await PATCH(await makeRequest({ cantoContentStart: 10 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })
    expect(response.status).toBe(400)
  })

  it('updates the episode title instead of anchors when title is given', async () => {
    vi.mocked(updateEpisodeTitle).mockResolvedValue({
      id: 'ep-1',
      title: 'New Title',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
      cantoContentStart: null,
      cantoContentEnd: null,
      englishContentStart: null,
      englishContentEnd: null,
    })

    const response = await PATCH(await makeRequest({ title: 'New Title' }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.episode.title).toBe('New Title')
    expect(updateEpisodeTitle).toHaveBeenCalledWith(expect.anything(), 'ep-1', 'New Title')
    expect(updateEpisodeAnchors).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoContentStart: 10, cantoContentEnd: 110, englishContentStart: 20, englishContentEnd: 220 }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await PATCH(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
