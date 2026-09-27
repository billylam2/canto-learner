import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listPublishedEpisodes } from '@/lib/db/dub-sync'

export const metadata = {
  title: 'Peppa 豬',
}

// The playlist experience (episode + sidebar of every episode) lives at /dub-sync/[episodeId] —
// this route just lands you on the first one, so / is a stable entry point. Only ever redirects
// among published episodes — one still being set up in admin (segments, anchors, etc.) has no
// way to be reached from here until it's published.
export default async function HomePage() {
  const supabase = createSupabaseServerClient()
  const episodes = await listPublishedEpisodes(supabase)

  if (episodes.length === 0) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Peppa 豬</h1>
        <p className="text-gray-500 dark:text-gray-400">No episodes yet.</p>
      </main>
    )
  }

  redirect(`/dub-sync/${episodes[0].id}`)
}
