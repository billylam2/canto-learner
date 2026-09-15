import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  createSessionCookieValue,
  readSession,
  setSessionCookie,
  clearSessionCookie,
  COOKIE_NAME,
} from './session'

describe('session', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('round-trips session data through a cookie', async () => {
    const value = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })

    const response = NextResponse.next()
    setSessionCookie(response, value)
    const cookieValue = response.cookies.get(COOKIE_NAME)?.value
    expect(cookieValue).toBeDefined()

    const request = new NextRequest('http://localhost/api/whoami', {
      headers: { cookie: `${COOKIE_NAME}=${cookieValue}` },
    })
    const session = await readSession(request)
    expect(session).toEqual({ kidId: 'kid-1', username: 'mimi' })
  })

  it('returns null when no cookie is present', async () => {
    const request = new NextRequest('http://localhost/api/whoami')
    expect(await readSession(request)).toBeNull()
  })

  it('clears the cookie', () => {
    const response = NextResponse.next()
    clearSessionCookie(response)
    expect(response.cookies.get(COOKIE_NAME)?.value).toBe('')
  })

  it('throws when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET
    await expect(createSessionCookieValue({ kidId: 'x', username: 'y' })).rejects.toThrow(
      'SESSION_SECRET must be set'
    )
  })
})
