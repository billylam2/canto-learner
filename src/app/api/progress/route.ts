import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { readSession } from '@/lib/auth/session'
import { saveLevelProgress } from '@/lib/db/progress'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const levelId = typeof body?.levelId === 'number' ? body.levelId : null
  const starsEarned = typeof body?.starsEarned === 'number' ? body.starsEarned : null
  const gameType = typeof body?.gameType === 'string' ? body.gameType : null

  if (levelId === null || starsEarned === null || !gameType) {
    return NextResponse.json({ error: 'levelId, starsEarned, and gameType are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  await saveLevelProgress(supabase, session.kidId, levelId, starsEarned, gameType)

  return NextResponse.json({ ok: true })
}
