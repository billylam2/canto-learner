import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSessionCookieValue, COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/accessories', () => ({
  purchaseAccessory: vi.fn(),
}))

import { POST } from './route'
import { purchaseAccessory } from '@/lib/db/accessories'

async function makeAuthenticatedRequest(body: unknown) {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
  return new NextRequest('http://localhost/api/accessories/purchase', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${cookieValue}`,
    },
  })
}

describe('POST /api/accessories/purchase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('purchases the accessory for the authenticated kid', async () => {
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(purchaseAccessory).toHaveBeenCalledWith(expect.anything(), 'kid-1', 'bow')
  })

  it('rejects an unauthenticated request', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const request = new NextRequest('http://localhost/api/accessories/purchase', {
      method: 'POST',
      body: JSON.stringify({ accessorySlug: 'bow' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('rejects a request missing accessorySlug', async () => {
    const request = await makeAuthenticatedRequest({})
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 400 when the purchase is rejected', async () => {
    vi.mocked(purchaseAccessory).mockRejectedValue(new Error('cannot afford'))
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow' })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
