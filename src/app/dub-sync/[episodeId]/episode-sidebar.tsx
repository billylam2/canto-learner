import Image from 'next/image'
import Link from 'next/link'
import type { DubEpisode } from '@/lib/db/dub-sync'

interface EpisodeSidebarProps {
  episodes: DubEpisode[]
  currentEpisodeId: string
}

export function EpisodeSidebar({ episodes, currentEpisodeId }: EpisodeSidebarProps) {
  return (
    <aside className="w-full lg:w-72 flex flex-col gap-2 lg:shrink-0" aria-label="Playlist">
      {episodes.map((episode) => (
        <Link
          key={episode.id}
          href={`/dub-sync/${episode.id}`}
          className={`flex gap-2 p-2 rounded ${episode.id === currentEpisodeId ? 'bg-gray-200' : ''}`}
        >
          <Image
            src={`https://i.ytimg.com/vi/${episode.cantoneseVideoId}/mqdefault.jpg`}
            alt=""
            width={96}
            height={54}
            className="rounded shrink-0 object-cover"
          />
          <span className="text-sm">{episode.title}</span>
        </Link>
      ))}
    </aside>
  )
}
