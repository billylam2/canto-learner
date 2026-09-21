import { sealData, unsealData } from 'iron-session'
import type { NextRequest, NextResponse } from 'next/server'

export interface AdminSessionData {
  isAdmin: true
}

export const ADMIN_COOKIE_NAME = 'dub_sync_admin_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

function getSessionPassword(): string {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set to a string of at least 32 characters')
  }
  return password
}

export async function createAdminSessionCookieValue(data: AdminSessionData): Promise<string> {
  return sealData(data, { password: getSessionPassword() })
}

export async function readAdminSessionFromCookieValue(
  cookie: string | undefined
): Promise<AdminSessionData | null> {
  if (!cookie) return null
  try {
    // unsealData doesn't always throw on a malformed/garbage cookie — for some inputs it
    // resolves to {} instead, which would be truthy and wrongly treated as an authenticated
    // session by callers doing `if (!session)`. The isAdmin check below guards against that.
    const data = await unsealData<Partial<AdminSessionData>>(cookie, { password: getSessionPassword() })
    return data.isAdmin === true ? { isAdmin: true } : null
  } catch {
    return null
  }
}

export async function readAdminSession(request: NextRequest): Promise<AdminSessionData | null> {
  return readAdminSessionFromCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
}

export function setAdminSessionCookie(response: NextResponse, value: string): void {
  response.cookies.set(ADMIN_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE_NAME, '', { maxAge: 0, path: '/' })
}
