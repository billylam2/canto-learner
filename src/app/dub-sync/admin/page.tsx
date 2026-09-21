import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes, listSegments, listCantoWords, type DubSegment, type CantoWord } from '@/lib/db/dub-sync'
import { readAdminSessionFromCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'
import { Admin } from './admin'

export default async function DubSyncAdminPage() {
  const cookieStore = await cookies()
  const session = await readAdminSessionFromCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  if (!session) {
    redirect('/dub-sync/login')
  }

  const supabase = createSupabaseServerClient()
  const episodes = await listEpisodes(supabase)

  const segmentsByEpisode: Record<string, DubSegment[]> = {}
  const cantoWordsByEpisode: Record<string, CantoWord[]> = {}
  for (const episode of episodes) {
    segmentsByEpisode[episode.id] = await listSegments(supabase, episode.id)
    cantoWordsByEpisode[episode.id] = await listCantoWords(supabase, episode.id)
  }

  return <Admin episodes={episodes} segmentsByEpisode={segmentsByEpisode} cantoWordsByEpisode={cantoWordsByEpisode} />
}
