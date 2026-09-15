import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProgressRow {
  levelId: number
  starsEarned: number
  completedGameTypes: string[]
}

export async function getProgressForKid(supabase: SupabaseClient, kidId: string): Promise<ProgressRow[]> {
  const { data, error } = await supabase
    .from('progress')
    .select('level_id, stars_earned, completed_game_types')
    .eq('kid_id', kidId)

  if (error) {
    throw new Error(`Failed to fetch progress for kid ${kidId}: ${error.message}`)
  }

  return (data ?? []).map((row: { level_id: number; stars_earned: number; completed_game_types: string[] }) => ({
    levelId: row.level_id,
    starsEarned: row.stars_earned,
    completedGameTypes: row.completed_game_types,
  }))
}

export async function saveLevelProgress(
  supabase: SupabaseClient,
  kidId: string,
  levelId: number,
  starsEarned: number,
  gameType: string
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('progress')
    .select('stars_earned, completed_game_types')
    .eq('kid_id', kidId)
    .eq('level_id', levelId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Failed to fetch existing progress: ${fetchError.message}`)
  }

  const bestStars = Math.max(existing?.stars_earned ?? 0, starsEarned)
  const existingGameTypes: string[] = existing?.completed_game_types ?? []
  const completedGameTypes = existingGameTypes.includes(gameType)
    ? existingGameTypes
    : [...existingGameTypes, gameType]

  const { error: upsertError } = await supabase.from('progress').upsert(
    {
      kid_id: kidId,
      level_id: levelId,
      stars_earned: bestStars,
      completed_game_types: completedGameTypes,
    },
    { onConflict: 'kid_id,level_id' }
  )

  if (upsertError) {
    throw new Error(`Failed to save progress: ${upsertError.message}`)
  }
}
