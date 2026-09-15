import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { hashPin, isValidPinFormat } from '@/lib/auth/pin'
import { validateUsername } from '@/lib/auth/username'
import { findKidByUsername, createKid } from '@/lib/db/kids'
import { createSessionCookieValue, setSessionCookie } from '@/lib/auth/session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''

  const usernameCheck = validateUsername(username)
  if (!usernameCheck.valid) {
    return NextResponse.json({ error: usernameCheck.reason }, { status: 400 })
  }
  if (!isValidPinFormat(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()

  const existing = await findKidByUsername(supabase, username)
  if (existing) {
    return NextResponse.json({ error: 'That username is taken' }, { status: 409 })
  }

  const pinHash = await hashPin(pin)
  const created = await createKid(supabase, username, pinHash)

  const cookieValue = await createSessionCookieValue({ kidId: created.id, username: created.username })
  const response = NextResponse.json({ id: created.id, username: created.username }, { status: 201 })
  setSessionCookie(response, cookieValue)
  return response
}
