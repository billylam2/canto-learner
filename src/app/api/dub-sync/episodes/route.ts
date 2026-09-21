import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { createEpisode } from '@/lib/db/dub-sync'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title : null
  const cantoneseVideoId = typeof body?.cantoneseVideoId === 'string' ? body.cantoneseVideoId : null
  const englishVideoId = typeof body?.englishVideoId === 'string' ? body.englishVideoId : null

  if (!title || !cantoneseVideoId || !englishVideoId) {
    return NextResponse.json({ error: 'title, cantoneseVideoId, and englishVideoId are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const episode = await createEpisode(supabase, { title, cantoneseVideoId, englishVideoId })
  return NextResponse.json({ episode }, { status: 201 })
}
