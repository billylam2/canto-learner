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

export interface DubSegment {
  id: string
  episodeId: string
  position: number
  label: string | null
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

interface DubSegmentRow {
  id: string
  episode_id: string
  position: number
  label: string | null
  canto_start: number
  canto_end: number
  english_start: number
  english_end: number
}

function toDubSegment(row: DubSegmentRow): DubSegment {
  return {
    id: row.id,
    episodeId: row.episode_id,
    position: row.position,
    label: row.label,
    cantoStart: row.canto_start,
    cantoEnd: row.canto_end,
    englishStart: row.english_start,
    englishEnd: row.english_end,
  }
}

export interface CreateSegmentInput {
  label?: string | null
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

export interface UpdateSegmentInput {
  label?: string | null
  cantoStart?: number
  cantoEnd?: number
  englishStart?: number
  englishEnd?: number
}

async function getNextPosition(supabase: SupabaseClient, episodeId: string): Promise<number> {
  const { data, error } = await supabase
    .from('dub_segments')
    .select('position')
    .eq('episode_id', episodeId)
    .order('position', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to determine next segment position for episode ${episodeId}: ${error.message}`)
  }
  const rows = (data ?? []) as Array<{ position: number }>
  return rows.length > 0 ? rows[0].position + 1 : 0
}

export async function listSegments(supabase: SupabaseClient, episodeId: string): Promise<DubSegment[]> {
  const { data, error } = await supabase
    .from('dub_segments')
    .select('*')
    .eq('episode_id', episodeId)
    .order('position', { ascending: true })

  if (error) {
    throw new Error(`Failed to list segments for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as DubSegmentRow[]).map(toDubSegment)
}

export async function createSegment(
  supabase: SupabaseClient,
  episodeId: string,
  input: CreateSegmentInput
): Promise<DubSegment> {
  const position = await getNextPosition(supabase, episodeId)
  const { data, error } = await supabase
    .from('dub_segments')
    .insert({
      episode_id: episodeId,
      position,
      label: input.label ?? null,
      canto_start: input.cantoStart,
      canto_end: input.cantoEnd,
      english_start: input.englishStart,
      english_end: input.englishEnd,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create segment for episode ${episodeId}: ${error?.message ?? 'unknown error'}`)
  }
  return toDubSegment(data as DubSegmentRow)
}

export async function createSegmentsBulk(
  supabase: SupabaseClient,
  episodeId: string,
  inputs: CreateSegmentInput[]
): Promise<DubSegment[]> {
  if (inputs.length === 0) return []

  const startPosition = await getNextPosition(supabase, episodeId)
  const rows = inputs.map((input, index) => ({
    episode_id: episodeId,
    position: startPosition + index,
    label: input.label ?? null,
    canto_start: input.cantoStart,
    canto_end: input.cantoEnd,
    english_start: input.englishStart,
    english_end: input.englishEnd,
  }))

  const { data, error } = await supabase.from('dub_segments').insert(rows).select('*')

  if (error) {
    throw new Error(`Failed to bulk-create segments for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as DubSegmentRow[]).map(toDubSegment)
}

export async function updateSegment(
  supabase: SupabaseClient,
  segmentId: string,
  patch: UpdateSegmentInput
): Promise<DubSegment> {
  const updates: Record<string, unknown> = {}
  if (patch.label !== undefined) updates.label = patch.label
  if (patch.cantoStart !== undefined) updates.canto_start = patch.cantoStart
  if (patch.cantoEnd !== undefined) updates.canto_end = patch.cantoEnd
  if (patch.englishStart !== undefined) updates.english_start = patch.englishStart
  if (patch.englishEnd !== undefined) updates.english_end = patch.englishEnd

  const { data, error } = await supabase
    .from('dub_segments')
    .update(updates)
    .eq('id', segmentId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to update segment ${segmentId}: ${error?.message ?? 'unknown error'}`)
  }
  return toDubSegment(data as DubSegmentRow)
}

export async function deleteSegment(supabase: SupabaseClient, segmentId: string): Promise<void> {
  const { error } = await supabase.from('dub_segments').delete().eq('id', segmentId)
  if (error) {
    throw new Error(`Failed to delete segment ${segmentId}: ${error.message}`)
  }
}

export interface CantoWord {
  id: string
  episodeId: string
  text: string
  startTime: number
  endTime: number
}

interface CantoWordRow {
  id: string
  episode_id: string
  text: string
  start_time: number
  end_time: number
}

function toCantoWord(row: CantoWordRow): CantoWord {
  return {
    id: row.id,
    episodeId: row.episode_id,
    text: row.text,
    startTime: row.start_time,
    endTime: row.end_time,
  }
}

export interface CreateCantoWordInput {
  text: string
  startTime: number
  endTime: number
}

export async function replaceCantoWords(
  supabase: SupabaseClient,
  episodeId: string,
  words: CreateCantoWordInput[]
): Promise<CantoWord[]> {
  const { error: deleteError } = await supabase.from('dub_canto_words').delete().eq('episode_id', episodeId)
  if (deleteError) {
    throw new Error(`Failed to clear existing canto words for episode ${episodeId}: ${deleteError.message}`)
  }

  if (words.length === 0) return []

  const rows = words.map((word) => ({
    episode_id: episodeId,
    text: word.text,
    start_time: word.startTime,
    end_time: word.endTime,
  }))

  const { data, error } = await supabase.from('dub_canto_words').insert(rows).select('*')
  if (error) {
    throw new Error(`Failed to save canto words for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as CantoWordRow[]).map(toCantoWord)
}

export async function listCantoWords(supabase: SupabaseClient, episodeId: string): Promise<CantoWord[]> {
  const { data, error } = await supabase
    .from('dub_canto_words')
    .select('*')
    .eq('episode_id', episodeId)
    .order('start_time', { ascending: true })

  if (error) {
    throw new Error(`Failed to list canto words for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as CantoWordRow[]).map(toCantoWord)
}
