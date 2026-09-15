import { sealData, unsealData } from 'iron-session'
import type { NextRequest, NextResponse } from 'next/server'

export interface SessionData {
  kidId: string
  username: string
}

export const COOKIE_NAME = 'canto_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

function getSessionPassword(): string {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set to a string of at least 32 characters')
  }
  return password
}

export async function createSessionCookieValue(data: SessionData): Promise<string> {
  return sealData(data, { password: getSessionPassword() })
}

export async function readSessionFromCookieValue(
  cookie: string | undefined
): Promise<SessionData | null> {
  if (!cookie) return null
  try {
    return await unsealData<SessionData>(cookie, { password: getSessionPassword() })
  } catch {
    return null
  }
}

export async function readSession(request: NextRequest): Promise<SessionData | null> {
  return readSessionFromCookieValue(request.cookies.get(COOKIE_NAME)?.value)
}

export function setSessionCookie(response: NextResponse, value: string): void {
  response.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
}
