import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { hashPin } from '@/lib/auth/pin'
import { COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/kids', () => ({
  findKidByUsername: vi.fn(),
  recordFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
}))

import { POST } from './route'
import { findKidByUsername, recordFailedLogin, resetFailedLogins } from '@/lib/db/kids'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('logs in with the correct PIN and resets failed attempts', async () => {
    const pinHash = await hashPin('4821')
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 2,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '4821' }))

    expect(response.status).toBe(200)
    expect(resetFailedLogins).toHaveBeenCalledWith(expect.anything(), 'kid-1')
    expect(response.cookies.get(COOKIE_NAME)).toBeDefined()
  })

  it('rejects an incorrect PIN and records the failed attempt', async () => {
    const pinHash = await hashPin('4821')
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 0,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '0000' }))

    expect(response.status).toBe(401)
    expect(recordFailedLogin).toHaveBeenCalledWith(expect.anything(), 'kid-1', 1, null)
  })

  it('locks the account after 5 failed attempts', async () => {
    const pinHash = await hashPin('4821')
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 4,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '0000' }))

    expect(response.status).toBe(401)
    expect(recordFailedLogin).toHaveBeenCalledWith(expect.anything(), 'kid-1', 5, expect.any(String))
  })

  it('rejects login while locked out, even with the correct PIN', async () => {
    const pinHash = await hashPin('4821')
    const lockedUntil = new Date(Date.now() + 60_000).toISOString()
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 5,
      locked_until: lockedUntil,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '4821' }))
    expect(response.status).toBe(429)
  })

  it('returns 401 for an unknown username', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue(null)
    const response = await POST(makeRequest({ username: 'ghost', pin: '1234' }))
    expect(response.status).toBe(401)
  })
})
