import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'
import { POST } from './route'

describe('POST /api/dub-sync/login', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    process.env.DUB_SYNC_ADMIN_PASSWORD = 'secret-pass'
  })

  it('sets the admin session cookie when the password matches', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret-pass' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.cookies.get(ADMIN_COOKIE_NAME)?.value).toBeTruthy()
  })

  it('rejects an incorrect password', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('throws when DUB_SYNC_ADMIN_PASSWORD is not set', async () => {
    delete process.env.DUB_SYNC_ADMIN_PASSWORD
    const request = new NextRequest('http://localhost/api/dub-sync/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'anything' }),
      headers: { 'content-type': 'application/json' },
    })
    await expect(POST(request)).rejects.toThrow('DUB_SYNC_ADMIN_PASSWORD must be set')
  })
})
