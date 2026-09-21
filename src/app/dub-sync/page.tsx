import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes } from '@/lib/db/dub-sync'

export default async function DubSyncPage() {
  const supabase = createSupabaseServerClient()
  const episodes = await listEpisodes(supabase)

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Dub Sync</h1>
      <ul className="flex flex-col gap-2">
        {episodes.map((episode) => (
          <li key={episode.id}>
            <Link href={`/dub-sync/${episode.id}`} className="underline">
              {episode.title}
            </Link>
          </li>
        ))}
        {episodes.length === 0 && <li className="text-gray-500">No episodes yet.</li>}
      </ul>
    </main>
  )
}
