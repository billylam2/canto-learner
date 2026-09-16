import type { SupabaseClient } from '@supabase/supabase-js'

export interface SceneInput {
  slug: string
  levelId: number
  name: string
  imageUrl: string
}

export async function upsertScene(supabase: SupabaseClient, scene: SceneInput): Promise<{ id: number }> {
  const { data, error } = await supabase
    .from('scenes')
    .upsert(
      { slug: scene.slug, level_id: scene.levelId, name: scene.name, image_url: scene.imageUrl },
      { onConflict: 'slug' }
    )
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to upsert scene ${scene.slug}: ${error?.message ?? 'unknown error'}`)
  }
  return data as { id: number }
}

export interface SceneObjectInput {
  sceneId: number
  vocabItemId: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export async function upsertSceneObject(supabase: SupabaseClient, sceneObject: SceneObjectInput): Promise<void> {
  const { error } = await supabase.from('scene_objects').upsert(
    {
      scene_id: sceneObject.sceneId,
      vocab_item_id: sceneObject.vocabItemId,
      x_percent: sceneObject.xPercent,
      y_percent: sceneObject.yPercent,
      width_percent: sceneObject.widthPercent,
      height_percent: sceneObject.heightPercent,
    },
    { onConflict: 'scene_id,vocab_item_id' }
  )

  if (error) {
    throw new Error(`Failed to upsert scene object for scene ${sceneObject.sceneId}: ${error.message}`)
  }
}

export interface SceneObjectGameItem {
  id: string
  slug: string
  audioUrl: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export interface SceneGameData {
  id: number
  imageUrl: string
  objects: SceneObjectGameItem[]
}

interface SceneObjectRow {
  x_percent: number
  y_percent: number
  width_percent: number
  height_percent: number
  vocab_items: { id: string; slug: string; audio_url: string }
}

export async function getScenesForLevel(supabase: SupabaseClient, levelId: number): Promise<SceneGameData[]> {
  const { data: scenes, error: scenesError } = await supabase
    .from('scenes')
    .select('id, image_url')
    .eq('level_id', levelId)
    .order('created_at', { ascending: true })

  if (scenesError) {
    throw new Error(`Failed to fetch scenes for level ${levelId}: ${scenesError.message}`)
  }

  const result: SceneGameData[] = []
  for (const scene of (scenes ?? []) as Array<{ id: number; image_url: string }>) {
    const { data: objects, error: objectsError } = await supabase
      .from('scene_objects')
      .select('x_percent, y_percent, width_percent, height_percent, vocab_items(id, slug, audio_url)')
      .eq('scene_id', scene.id)
      .order('created_at', { ascending: true })

    if (objectsError) {
      throw new Error(`Failed to fetch scene objects for scene ${scene.id}: ${objectsError.message}`)
    }

    result.push({
      id: scene.id,
      imageUrl: scene.image_url,
      objects: ((objects ?? []) as unknown as SceneObjectRow[]).map((row) => ({
        id: row.vocab_items.id,
        slug: row.vocab_items.slug,
        audioUrl: row.vocab_items.audio_url,
        xPercent: row.x_percent,
        yPercent: row.y_percent,
        widthPercent: row.width_percent,
        heightPercent: row.height_percent,
      })),
    })
  }

  return result
}
