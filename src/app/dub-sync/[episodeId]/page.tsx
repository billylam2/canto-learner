import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, listPublishedEpisodes, listSegments } from '@/lib/db/dub-sync'
import { Player } from './player'

export const metadata = {
  title: 'Peppa 豬',
}

export default async function DubSyncEpisodePage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params
  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  // Not published means not reachable at all from the learner-facing site — not listed in the
  // sidebar, and not directly loadable by URL either, regardless of who's asking (this route
  // doesn't check for an admin session, unlike the admin tool itself).
  if (!episode || !episode.published) {
    notFound()
  }

  const [segments, episodes] = await Promise.all([listSegments(supabase, episodeId), listPublishedEpisodes(supabase)])
  // Remounts Player fresh on every episode switch (sidebar click or auto-advance) rather than
  // carry over stale state — fullscreen, alternating mode, etc. — from the previous episode.
  return <Player key={episode.id} episode={episode} segments={segments} episodes={episodes} />
}
