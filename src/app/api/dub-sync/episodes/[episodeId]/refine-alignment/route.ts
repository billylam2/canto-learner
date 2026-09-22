import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode } from '@/lib/db/dub-sync'
import { refineAlignment } from '@/lib/dub-sync/refine-alignment'
import { extractClipHashes } from '@/lib/dub-sync/extract-clip-hashes'
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
  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  if (episode.cantoContentStart === null || episode.englishContentStart === null) {
    return NextResponse.json(
      { error: 'Both content-start marks must be set before refining alignment' },
      { status: 400 }
    )
  }

  try {
    const result = await refineAlignment(
      {
        cantoneseVideoId: episode.cantoneseVideoId,
        englishVideoId: episode.englishVideoId,
        cantoContentStart: episode.cantoContentStart,
        englishContentStart: episode.englishContentStart,
      },
      { extractClipHashes }
    )
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: `Failed to refine alignment: ${(error as Error).message}` }, { status: 502 })
  }
}
