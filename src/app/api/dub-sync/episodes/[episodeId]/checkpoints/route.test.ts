import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  listResyncCheckpoints: vi.fn(),
  createResyncCheckpoint: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, listResyncCheckpoints, createResyncCheckpoint } from '@/lib/db/dub-sync'

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

async function makeRequest(body: unknown): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/checkpoints', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a checkpoint', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([])
    vi.mocked(createResyncCheckpoint).mockResolvedValue({
      id: 'chk-1',
      episodeId: 'ep-1',
      cantoTime: 60,
      englishTime: 100,
    })

    const response = await POST(await makeRequest({ cantoTime: 60, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })

    expect(response.status).toBe(201)
    expect(createResyncCheckpoint).toHaveBeenCalledWith(expect.anything(), 'ep-1', { cantoTime: 60, englishTime: 100 })
  })

  it('rejects a request missing required fields', async () => {
    const response = await POST(await makeRequest({ cantoTime: 60 }), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(400)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest({ cantoTime: 60, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'missing' }),
    })
    expect(response.status).toBe(404)
  })

  it('returns 400 when anchors are not fully set', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...episodeWithAnchors, englishContentEnd: null })
    const response = await POST(await makeRequest({ cantoTime: 60, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })
    expect(response.status).toBe(400)
  })

  it('returns 400 with the validation message when the checkpoint placement is invalid', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([])
    const response = await POST(await makeRequest({ cantoTime: 5, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Checkpoint must fall within the marked content')
    expect(createResyncCheckpoint).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints', {
      method: 'POST',
      body: JSON.stringify({ cantoTime: 60, englishTime: 100 }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
