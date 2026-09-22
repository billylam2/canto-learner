import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes } from '@/lib/db/dub-sync'

// The playlist experience (episode + sidebar of every episode) lives at /dub-sync/[episodeId] —
// this route just lands you on the first one, so /dub-sync is a stable entry point.
export default async function DubSyncPage() {
  const supabase = createSupabaseServerClient()
  const episodes = await listEpisodes(supabase)

  if (episodes.length === 0) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Dub Sync</h1>
        <p className="text-gray-500">No episodes yet.</p>
      </main>
    )
  }

  redirect(`/dub-sync/${episodes[0].id}`)
}
