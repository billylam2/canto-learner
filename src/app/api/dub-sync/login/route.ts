import { NextRequest, NextResponse } from 'next/server'
import { createAdminSessionCookieValue, setAdminSessionCookie } from '@/lib/auth/admin-session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''

  const adminPassword = process.env.DUB_SYNC_ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('DUB_SYNC_ADMIN_PASSWORD must be set')
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const cookieValue = await createAdminSessionCookieValue({ isAdmin: true })
  const response = NextResponse.json({ ok: true })
  setAdminSessionCookie(response, cookieValue)
  return response
}
