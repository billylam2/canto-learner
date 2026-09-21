import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { updateEpisodeAnchors } from '@/lib/db/dub-sync'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const { episodeId } = await params
  const body = await request.json().catch(() => null)
  const cantoContentStart = typeof body?.cantoContentStart === 'number' ? body.cantoContentStart : null
  const cantoContentEnd = typeof body?.cantoContentEnd === 'number' ? body.cantoContentEnd : null
  const englishContentStart = typeof body?.englishContentStart === 'number' ? body.englishContentStart : null
  const englishContentEnd = typeof body?.englishContentEnd === 'number' ? body.englishContentEnd : null

  if (
    cantoContentStart === null ||
    cantoContentEnd === null ||
    englishContentStart === null ||
    englishContentEnd === null
  ) {
    return NextResponse.json(
      { error: 'cantoContentStart, cantoContentEnd, englishContentStart, and englishContentEnd are required' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServerClient()
  const episode = await updateEpisodeAnchors(supabase, episodeId, {
    cantoContentStart,
    cantoContentEnd,
    englishContentStart,
    englishContentEnd,
  })
  return NextResponse.json({ episode })
}
