import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { readSession } from '@/lib/auth/session'
import { setAccessoryEquipped } from '@/lib/db/accessories'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const accessorySlug = typeof body?.accessorySlug === 'string' ? body.accessorySlug : null
  const equipped = typeof body?.equipped === 'boolean' ? body.equipped : null

  if (!accessorySlug || equipped === null) {
    return NextResponse.json({ error: 'accessorySlug and equipped are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  try {
    await setAccessoryEquipped(supabase, session.kidId, accessorySlug, equipped)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
