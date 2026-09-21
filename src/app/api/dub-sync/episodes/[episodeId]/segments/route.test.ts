import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  createSegment: vi.fn(),
}))

import { POST } from './route'
import { createSegment } from '@/lib/db/dub-sync'

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

describe('POST /api/dub-sync/episodes/[episodeId]/segments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a segment', async () => {
    vi.mocked(createSegment).mockResolvedValue({
      id: 'seg-1',
      episodeId: 'ep-1',
      position: 0,
      label: null,
      cantoStart: 12.5,
      cantoEnd: 15.0,
      englishStart: 10.0,
      englishEnd: 13.2,
    })

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments', {
      method: 'POST',
      body: JSON.stringify({ cantoStart: 12.5, cantoEnd: 15.0, englishStart: 10.0, englishEnd: 13.2 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    expect(createSegment).toHaveBeenCalledWith(expect.anything(), 'ep-1', {
      label: null,
      cantoStart: 12.5,
      cantoEnd: 15.0,
      englishStart: 10.0,
      englishEnd: 13.2,
    })
  })

  it('rejects a request missing required fields', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments', {
      method: 'POST',
      body: JSON.stringify({ cantoStart: 12.5 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(400)
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments', {
      method: 'POST',
      body: JSON.stringify({ cantoStart: 1, cantoEnd: 2, englishStart: 1, englishEnd: 2 }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
