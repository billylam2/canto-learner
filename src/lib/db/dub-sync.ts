import type { SupabaseClient } from '@supabase/supabase-js'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'

export interface DubEpisode {
  id: string
  title: string
  cantoneseVideoId: string
  englishVideoId: string
  cantoContentStart: number | null
  cantoContentEnd: number | null
  englishContentStart: number | null
  englishContentEnd: number | null
}

interface DubEpisodeRow {
  id: string
  title: string
  cantonese_video_id: string
  english_video_id: string
  canto_content_start: number | null
  canto_content_end: number | null
  english_content_start: number | null
  english_content_end: number | null
}

function toDubEpisode(row: DubEpisodeRow): DubEpisode {
  return {
    id: row.id,
    title: row.title,
    cantoneseVideoId: row.cantonese_video_id,
    englishVideoId: row.english_video_id,
    cantoContentStart: row.canto_content_start,
    cantoContentEnd: row.canto_content_end,
    englishContentStart: row.english_content_start,
    englishContentEnd: row.english_content_end,
  }
}

export interface CreateEpisodeInput {
  title: string
  cantoneseVideoId: string
  englishVideoId: string
}

export async function createEpisode(supabase: SupabaseClient, input: CreateEpisodeInput): Promise<DubEpisode> {
  const { data, error } = await supabase
    .from('dub_episodes')
    .insert({ title: input.title, cantonese_video_id: input.cantoneseVideoId, english_video_id: input.englishVideoId })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create episode ${input.title}: ${error?.message ?? 'unknown error'}`)
  }
  return toDubEpisode(data as DubEpisodeRow)
}

export async function listEpisodes(supabase: SupabaseClient): Promise<DubEpisode[]> {
  const { data, error } = await supabase.from('dub_episodes').select('*').order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to list episodes: ${error.message}`)
  }
  return ((data ?? []) as DubEpisodeRow[]).map(toDubEpisode)
}

export async function getEpisode(supabase: SupabaseClient, episodeId: string): Promise<DubEpisode | null> {
  const { data, error } = await supabase.from('dub_episodes').select('*').eq('id', episodeId).maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch episode ${episodeId}: ${error.message}`)
  }
  return data ? toDubEpisode(data as DubEpisodeRow) : null
}

export async function updateEpisodeAnchors(
  supabase: SupabaseClient,
  episodeId: string,
  anchors: EpisodeAnchors
): Promise<DubEpisode> {
  const { data, error } = await supabase
    .from('dub_episodes')
    .update({
      canto_content_start: anchors.cantoContentStart,
      canto_content_end: anchors.cantoContentEnd,
      english_content_start: anchors.englishContentStart,
      english_content_end: anchors.englishContentEnd,
    })
    .eq('id', episodeId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to update anchors for episode ${episodeId}: ${error?.message ?? 'unknown error'}`)
  }
  return toDubEpisode(data as DubEpisodeRow)
}
