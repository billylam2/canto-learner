import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, listSegments } from '@/lib/db/dub-sync'
import { Editor } from './editor'

export default async function EditorPage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params
  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    notFound()
  }

  const segments = await listSegments(supabase, episodeId)
  return <Editor episode={episode} segments={segments} />
}
