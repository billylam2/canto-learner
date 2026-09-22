import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, listEpisodes, listSegments } from '@/lib/db/dub-sync'
import { Player } from './player'

export default async function DubSyncEpisodePage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params
  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    notFound()
  }

  const [segments, episodes] = await Promise.all([listSegments(supabase, episodeId), listEpisodes(supabase)])
  // Remounts Player fresh on every episode switch (sidebar click or auto-advance) rather than
  // carry over stale state — fullscreen, alternating mode, etc. — from the previous episode.
  return <Player key={episode.id} episode={episode} segments={segments} episodes={episodes} />
}
