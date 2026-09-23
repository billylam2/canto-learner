import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, listResyncCheckpoints, createResyncCheckpoint } from '@/lib/db/dub-sync'
import { validateCheckpointOrder } from '@/lib/dub-sync/resync-checkpoints'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId } = await params
  const body = await request.json().catch(() => null)
  const cantoTime = typeof body?.cantoTime === 'number' ? body.cantoTime : null
  const englishTime = typeof body?.englishTime === 'number' ? body.englishTime : null

  if (cantoTime === null || englishTime === null) {
    return NextResponse.json({ error: 'cantoTime and englishTime are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  if (
    episode.cantoContentStart === null ||
    episode.cantoContentEnd === null ||
    episode.englishContentStart === null ||
    episode.englishContentEnd === null
  ) {
    return NextResponse.json({ error: 'Episode anchors must be set before adding a checkpoint' }, { status: 400 })
  }

  const anchors: EpisodeAnchors = {
    cantoContentStart: episode.cantoContentStart,
    cantoContentEnd: episode.cantoContentEnd,
    englishContentStart: episode.englishContentStart,
    englishContentEnd: episode.englishContentEnd,
  }

  const existingCheckpoints = await listResyncCheckpoints(supabase, episodeId)
  const validationError = validateCheckpointOrder(anchors, existingCheckpoints, { cantoTime, englishTime })
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const checkpoint = await createResyncCheckpoint(supabase, episodeId, { cantoTime, englishTime })
  return NextResponse.json({ checkpoint }, { status: 201 })
}
