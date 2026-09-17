import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSessionCookieValue, COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/accessories', () => ({
  setAccessoryEquipped: vi.fn(),
}))

import { POST } from './route'
import { setAccessoryEquipped } from '@/lib/db/accessories'

async function makeAuthenticatedRequest(body: unknown) {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
  return new NextRequest('http://localhost/api/accessories/equip', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${cookieValue}`,
    },
  })
}

describe('POST /api/accessories/equip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates equip state for the authenticated kid', async () => {
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow', equipped: false })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(setAccessoryEquipped).toHaveBeenCalledWith(expect.anything(), 'kid-1', 'bow', false)
  })

  it('rejects an unauthenticated request', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const request = new NextRequest('http://localhost/api/accessories/equip', {
      method: 'POST',
      body: JSON.stringify({ accessorySlug: 'bow', equipped: false }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('rejects a request missing required fields', async () => {
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow' })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 400 when the update is rejected', async () => {
    vi.mocked(setAccessoryEquipped).mockRejectedValue(new Error('does not own'))
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow', equipped: true })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
