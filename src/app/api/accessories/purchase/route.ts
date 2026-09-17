import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { readSession } from '@/lib/auth/session'
import { purchaseAccessory } from '@/lib/db/accessories'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const accessorySlug = typeof body?.accessorySlug === 'string' ? body.accessorySlug : null

  if (!accessorySlug) {
    return NextResponse.json({ error: 'accessorySlug is required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  try {
    await purchaseAccessory(supabase, session.kidId, accessorySlug)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
