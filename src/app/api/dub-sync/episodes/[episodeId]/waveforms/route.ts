import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, replaceWaveforms } from '@/lib/db/dub-sync'
import { downloadAudio, deleteAudioFile } from '@/lib/dub-sync/download-audio'
import { extractWaveformPeaks } from '@/lib/dub-sync/waveform'
import { readAdminSession } from '@/lib/auth/admin-session'

async function extractPeaksFor(videoId: string, label: string): Promise<number[]> {
  let audioPath: string
  try {
    audioPath = await downloadAudio(videoId)
  } catch (error) {
    throw new Error(`${label} audio (${videoId}) failed: ${(error as Error).message}`)
  }
  try {
    return await extractWaveformPeaks(audioPath)
  } catch (error) {
    throw new Error(`${label} audio (${videoId}) failed: ${(error as Error).message}`)
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

  let cantoPeaks: number[]
  let englishPeaks: number[]
  try {
    cantoPeaks = await extractPeaksFor(episode.cantoneseVideoId, 'Cantonese')
    englishPeaks = await extractPeaksFor(episode.englishVideoId, 'English')
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 })
  }

  const waveforms = await replaceWaveforms(supabase, episodeId, [
    { language: 'canto', peaks: cantoPeaks },
    { language: 'english', peaks: englishPeaks },
  ])
  return NextResponse.json({ waveforms }, { status: 201 })
}
