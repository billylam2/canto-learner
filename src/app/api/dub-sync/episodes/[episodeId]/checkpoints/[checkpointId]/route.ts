import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import {
  getEpisode,
  listResyncCheckpoints,
  updateResyncCheckpoint,
  deleteResyncCheckpoint,
  type UpdateResyncCheckpointInput,
} from '@/lib/db/dub-sync'
import { validateCheckpointOrder } from '@/lib/dub-sync/resync-checkpoints'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string; checkpointId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId, checkpointId } = await params
  const body = await request.json().catch(() => null)

  const patch: UpdateResyncCheckpointInput = {}
  if (typeof body?.cantoTime === 'number') patch.cantoTime = body.cantoTime
  if (typeof body?.englishTime === 'number') patch.englishTime = body.englishTime

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
    return NextResponse.json({ error: 'Episode anchors must be set before editing a checkpoint' }, { status: 400 })
  }

  const anchors: EpisodeAnchors = {
    cantoContentStart: episode.cantoContentStart,
    cantoContentEnd: episode.cantoContentEnd,
    englishContentStart: episode.englishContentStart,
    englishContentEnd: episode.englishContentEnd,
  }

  const allCheckpoints = await listResyncCheckpoints(supabase, episodeId)
  const current = allCheckpoints.find((checkpoint) => checkpoint.id === checkpointId)
  if (!current) {
    return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 })
  }

  const otherCheckpoints = allCheckpoints.filter((checkpoint) => checkpoint.id !== checkpointId)
  const candidate = {
    cantoTime: patch.cantoTime ?? current.cantoTime,
    englishTime: patch.englishTime ?? current.englishTime,
  }
  const validationError = validateCheckpointOrder(anchors, otherCheckpoints, candidate)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const checkpoint = await updateResyncCheckpoint(supabase, checkpointId, patch)
  return NextResponse.json({ checkpoint })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string; checkpointId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { checkpointId } = await params
  const supabase = createSupabaseServerClient()
  await deleteResyncCheckpoint(supabase, checkpointId)
  return NextResponse.json({ ok: true })
}
