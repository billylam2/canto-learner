import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/kids', () => ({
  findKidByUsername: vi.fn(),
  createKid: vi.fn(),
}))

import { POST } from './route'
import { findKidByUsername, createKid } from '@/lib/db/kids'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/signup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('creates a kid and sets a session cookie', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue(null)
    vi.mocked(createKid).mockResolvedValue({ id: 'kid-1', username: 'mimi' })

    const response = await POST(makeRequest({ username: 'mimi', pin: '1234' }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 'kid-1', username: 'mimi' })
    expect(response.cookies.get(COOKIE_NAME)).toBeDefined()
  })

  it('rejects a duplicate username', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'existing',
      username: 'mimi',
      pin_hash: 'x',
      failed_login_attempts: 0,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '1234' }))
    expect(response.status).toBe(409)
  })

  it('rejects an invalid PIN format', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue(null)
    const response = await POST(makeRequest({ username: 'mimi', pin: '12' }))
    expect(response.status).toBe(400)
  })

  it('rejects an invalid username', async () => {
    const response = await POST(makeRequest({ username: 'ab', pin: '1234' }))
    expect(response.status).toBe(400)
  })
})
