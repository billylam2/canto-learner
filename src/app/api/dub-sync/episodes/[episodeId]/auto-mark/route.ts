import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, createSegmentsBulk } from '@/lib/db/dub-sync'
import { readAdminSession } from '@/lib/auth/admin-session'
import { downloadAudio, transcribeWithDiarization, deleteAudioFile } from '@/lib/dub-sync/transcribe'
import { groupWordsBySpeaker } from '@/lib/dub-sync/group-words-by-speaker'
import { pairDiarizedTurns } from '@/lib/dub-sync/pair-diarized-turns'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'

// Deletes its own audio file as soon as it's done with it (success or failure), rather than
// leaving cleanup to the caller — that would require the caller to track which downloads
// actually completed, and a naive `finally` at the POST level misses this: if one video's
// transcription rejects, Promise.all rejects before the other (successful) video's path is ever
// captured in the outer scope, leaking that file.
async function transcribeVideo(videoId: string, languageCode: string) {
  const audioPath = await downloadAudio(videoId)
  try {
    const words = await transcribeWithDiarization(audioPath, languageCode)
    return groupWordsBySpeaker(words)
  } finally {
    await deleteAudioFile(audioPath)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

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
    return NextResponse.json({ error: 'Episode anchors must be set before auto-marking' }, { status: 400 })
  }

  const anchors: EpisodeAnchors = {
    cantoContentStart: episode.cantoContentStart,
    cantoContentEnd: episode.cantoContentEnd,
    englishContentStart: episode.englishContentStart,
    englishContentEnd: episode.englishContentEnd,
  }

  let cantoTurns
  let englishTurns
  try {
    ;[cantoTurns, englishTurns] = await Promise.all([
      transcribeVideo(episode.cantoneseVideoId, 'yue-Hant-HK').catch((error) => {
        throw new Error(`Cantonese video (${episode.cantoneseVideoId}) failed: ${(error as Error).message}`)
      }),
      transcribeVideo(episode.englishVideoId, 'en-US').catch((error) => {
        throw new Error(`English video (${episode.englishVideoId}) failed: ${(error as Error).message}`)
      }),
    ])
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 })
  }

  const { segments: candidates, usedFallback } = pairDiarizedTurns(cantoTurns, englishTurns, anchors)
  const segments = await createSegmentsBulk(supabase, episodeId, candidates)

  return NextResponse.json(
    {
      segments,
      ...(usedFallback
        ? {
            warning: `Cantonese and English speaker-turn counts didn't match (${cantoTurns.length} vs ${englishTurns.length}); used proportional timing for English instead of direct alignment.`,
          }
        : {}),
    },
    { status: 201 }
  )
}
