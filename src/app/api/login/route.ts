import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { verifyPin } from '@/lib/auth/pin'
import { findKidByUsername, recordFailedLogin, resetFailedLogins } from '@/lib/db/kids'
import { createSessionCookieValue, setSessionCookie } from '@/lib/auth/session'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''

  if (!username || !pin) {
    return NextResponse.json({ error: 'Username and PIN are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const kid = await findKidByUsername(supabase, username)

  if (!kid) {
    return NextResponse.json({ error: 'Incorrect username or PIN' }, { status: 401 })
  }

  if (kid.locked_until && new Date(kid.locked_until) > new Date()) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const valid = await verifyPin(pin, kid.pin_hash)

  if (!valid) {
    const failedAttempts = kid.failed_login_attempts + 1
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : null
    await recordFailedLogin(supabase, kid.id, failedAttempts, lockedUntil)
    return NextResponse.json({ error: 'Incorrect username or PIN' }, { status: 401 })
  }

  await resetFailedLogins(supabase, kid.id)

  const cookieValue = await createSessionCookieValue({ kidId: kid.id, username: kid.username })
  const response = NextResponse.json({ id: kid.id, username: kid.username }, { status: 200 })
  setSessionCookie(response, cookieValue)
  return response
}
