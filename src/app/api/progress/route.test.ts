import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSessionCookieValue, COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/progress', () => ({
  saveLevelProgress: vi.fn(),
}))

import { POST } from './route'
import { saveLevelProgress } from '@/lib/db/progress'

async function makeAuthenticatedRequest(body: unknown) {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
  return new NextRequest('http://localhost/api/progress', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${cookieValue}`,
    },
  })
}

describe('POST /api/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves progress for the authenticated kid', async () => {
    const request = await makeAuthenticatedRequest({ levelId: 1, starsEarned: 12, gameType: 'listen-tap' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(saveLevelProgress).toHaveBeenCalledWith(expect.anything(), 'kid-1', 1, 12, 'listen-tap')
  })

  it('rejects an unauthenticated request', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const request = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ levelId: 1, starsEarned: 12, gameType: 'listen-tap' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('rejects a request missing required fields', async () => {
    const request = await makeAuthenticatedRequest({ levelId: 1 })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
