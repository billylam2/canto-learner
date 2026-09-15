import type { SupabaseClient } from '@supabase/supabase-js'
import type { LevelSource } from '../../../content/vocab'
import type { VocabGameItem } from '../game/round'

export async function upsertLevel(supabase: SupabaseClient, level: LevelSource): Promise<void> {
  const { error } = await supabase
    .from('levels')
    .upsert({ id: level.id, name: level.name, order: level.order, unlock_threshold: level.unlockThreshold })

  if (error) {
    throw new Error(`Failed to upsert level ${level.id}: ${error.message}`)
  }
}

export interface VocabItemInput {
  slug: string
  category: string
  cantoneseText: string
  jyutping: string
  englishGloss: string
  homophoneGroup: string | null
  audioUrl: string
  imageUrl: string
}

export async function upsertVocabItem(
  supabase: SupabaseClient,
  item: VocabItemInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('vocab_items')
    .upsert(
      {
        slug: item.slug,
        category: item.category,
        cantonese_text: item.cantoneseText,
        jyutping: item.jyutping,
        english_gloss: item.englishGloss,
        homophone_group: item.homophoneGroup,
        audio_url: item.audioUrl,
        image_url: item.imageUrl,
      },
      { onConflict: 'slug' }
    )
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to upsert vocab item ${item.slug}: ${error?.message ?? 'unknown error'}`)
  }
  return data as { id: string }
}

export async function linkVocabToLevel(
  supabase: SupabaseClient,
  levelId: number,
  vocabItemId: string
): Promise<void> {
  const { error } = await supabase
    .from('level_vocab')
    .upsert({ level_id: levelId, vocab_item_id: vocabItemId }, { onConflict: 'level_id,vocab_item_id' })

  if (error) {
    throw new Error(`Failed to link vocab item ${vocabItemId} to level ${levelId}: ${error.message}`)
  }
}

export async function getVocabItemsForLevel(
  supabase: SupabaseClient,
  levelId: number
): Promise<VocabGameItem[]> {
  const { data: links, error: linksError } = await supabase
    .from('level_vocab')
    .select('vocab_item_id')
    .eq('level_id', levelId)

  if (linksError) {
    throw new Error(`Failed to fetch level_vocab for level ${levelId}: ${linksError.message}`)
  }

  const vocabItemIds = (links ?? []).map((link: { vocab_item_id: string }) => link.vocab_item_id)
  if (vocabItemIds.length === 0) {
    return []
  }

  const { data: items, error: itemsError } = await supabase
    .from('vocab_items')
    .select('id, slug, audio_url, image_url, homophone_group')
    .in('id', vocabItemIds)
    .order('created_at', { ascending: true })

  if (itemsError) {
    throw new Error(`Failed to fetch vocab items for level ${levelId}: ${itemsError.message}`)
  }

  return (items ?? []).map(
    (item: { id: string; slug: string; audio_url: string; image_url: string; homophone_group: string | null }) => ({
      id: item.id,
      slug: item.slug,
      audioUrl: item.audio_url,
      imageUrl: item.image_url,
      homophoneGroup: item.homophone_group,
    })
  )
}
