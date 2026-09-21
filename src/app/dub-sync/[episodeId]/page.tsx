import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, listSegments } from '@/lib/db/dub-sync'
import { Player } from './player'

export default async function DubSyncEpisodePage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params
  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    notFound()
  }

  const segments = await listSegments(supabase, episodeId)
  return <Player episode={episode} segments={segments} />
}
