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
    const start = await refineAlignment(
      {
        cantoneseVideoId: episode.cantoneseVideoId,
        englishVideoId: episode.englishVideoId,
        cantoTime: episode.cantoContentStart,
        englishTime: episode.englishContentStart,
      },
      { extractClipHashes }
    )

    // Content end is only refined once both ends are already marked — a null end means the
    // admin hasn't gotten there yet, not something to guess at.
    const end =
      episode.cantoContentEnd !== null && episode.englishContentEnd !== null
        ? await refineAlignment(
            {
              cantoneseVideoId: episode.cantoneseVideoId,
              englishVideoId: episode.englishVideoId,
              cantoTime: episode.cantoContentEnd,
              englishTime: episode.englishContentEnd,
            },
            { extractClipHashes }
          )
        : null

    return NextResponse.json({
      suggestedEnglishContentStart: start.suggestedEnglishTime,
      startOffsetSeconds: start.offsetSeconds,
      startAvgDistance: start.avgDistance,
      startConfident: start.confident,
      suggestedEnglishContentEnd: end?.suggestedEnglishTime ?? null,
      endOffsetSeconds: end?.offsetSeconds ?? null,
      endAvgDistance: end?.avgDistance ?? null,
      endConfident: end?.confident ?? null,
    })
  } catch (error) {
    return NextResponse.json({ error: `Failed to refine alignment: ${(error as Error).message}` }, { status: 502 })
  }
}
