import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import {
  updateEpisodeAnchors,
  updateEpisodeTitle,
  updateEpisodeVideoIds,
  deleteEpisode,
  type UpdateEpisodeVideoIdsInput,
} from '@/lib/db/dub-sync'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId } = await params
  const body = await request.json().catch(() => null)

  if (typeof body?.title === 'string') {
    const supabase = createSupabaseServerClient()
    const episode = await updateEpisodeTitle(supabase, episodeId, body.title)
    return NextResponse.json({ episode })
  }

  if (typeof body?.cantoneseVideoId === 'string' || typeof body?.englishVideoId === 'string') {
    const patch: UpdateEpisodeVideoIdsInput = {}
    if (typeof body?.cantoneseVideoId === 'string') patch.cantoneseVideoId = body.cantoneseVideoId
    if (typeof body?.englishVideoId === 'string') patch.englishVideoId = body.englishVideoId
    const supabase = createSupabaseServerClient()
    const episode = await updateEpisodeVideoIds(supabase, episodeId, patch)
    return NextResponse.json({ episode })
  }

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId } = await params
  const supabase = createSupabaseServerClient()
  await deleteEpisode(supabase, episodeId)
  return NextResponse.json({ ok: true })
}
