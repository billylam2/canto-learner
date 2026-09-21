import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, createSegmentsBulk } from '@/lib/db/dub-sync'
import { fetchCantoneseCaptionCues } from '@/lib/dub-sync/captions'
import { cuesToCandidateSegments } from '@/lib/dub-sync/candidate-segments'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const { episodeId } = await params
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
    return NextResponse.json({ error: 'Episode anchors must be set before generating segments' }, { status: 400 })
  }

  const anchors: EpisodeAnchors = {
    cantoContentStart: episode.cantoContentStart,
    cantoContentEnd: episode.cantoContentEnd,
    englishContentStart: episode.englishContentStart,
    englishContentEnd: episode.englishContentEnd,
  }

  let cues
  try {
    cues = await fetchCantoneseCaptionCues(episode.cantoneseVideoId)
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch captions: ${(error as Error).message}` }, { status: 502 })
  }

  const candidates = cuesToCandidateSegments(cues, anchors)
  const segments = await createSegmentsBulk(supabase, episodeId, candidates)
  return NextResponse.json({ segments }, { status: 201 })
}
