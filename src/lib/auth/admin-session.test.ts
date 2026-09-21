import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  createAdminSessionCookieValue,
  readAdminSession,
  readAdminSessionFromCookieValue,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  ADMIN_COOKIE_NAME,
} from './admin-session'

describe('admin-session', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('round-trips session data through a cookie', async () => {
    const value = await createAdminSessionCookieValue({ isAdmin: true })

    const response = NextResponse.next()
    setAdminSessionCookie(response, value)
    const cookieValue = response.cookies.get(ADMIN_COOKIE_NAME)?.value
    expect(cookieValue).toBeDefined()

    const request = new NextRequest('http://localhost/api/dub-sync/episodes', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${cookieValue}` },
    })
    const session = await readAdminSession(request)
    expect(session).toEqual({ isAdmin: true })
  })

  it('returns null when no cookie is present', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes')
    expect(await readAdminSession(request)).toBeNull()
  })

  it('returns null for a garbage cookie value', async () => {
    expect(await readAdminSessionFromCookieValue('not-a-valid-sealed-value')).toBeNull()
  })

  it('clears the cookie', () => {
    const response = NextResponse.next()
    clearAdminSessionCookie(response)
    expect(response.cookies.get(ADMIN_COOKIE_NAME)?.value).toBe('')
  })

  it('throws when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET
    await expect(createAdminSessionCookieValue({ isAdmin: true })).rejects.toThrow(
      'SESSION_SECRET must be set'
    )
  })
})
