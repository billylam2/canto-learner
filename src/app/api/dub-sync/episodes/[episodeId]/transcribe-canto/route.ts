import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, replaceCantoWords } from '@/lib/db/dub-sync'
import { readAdminSession } from '@/lib/auth/admin-session'
import { downloadAudio, transcribeWords, deleteAudioFile } from '@/lib/dub-sync/transcribe'

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

  let audioPath: string
  try {
    audioPath = await downloadAudio(episode.cantoneseVideoId)
  } catch (error) {
    return NextResponse.json(
      { error: `Cantonese video (${episode.cantoneseVideoId}) failed to download: ${(error as Error).message}` },
      { status: 502 }
    )
  }

  let words
  try {
    words = await transcribeWords(audioPath, 'yue-Hant-HK')
  } catch (error) {
    await deleteAudioFile(audioPath)
    return NextResponse.json(
      { error: `Cantonese video (${episode.cantoneseVideoId}) failed to transcribe: ${(error as Error).message}` },
      { status: 502 }
    )
  }
  await deleteAudioFile(audioPath)

  const saved = await replaceCantoWords(supabase, episodeId, words)
  return NextResponse.json({ words: saved }, { status: 201 })
}
