import type { SupabaseClient } from '@supabase/supabase-js'
import { getProgressForKid } from './progress'
import { computeLifetimeStars } from '../game/level-status'
import { ACCESSORIES } from '../../../content/rewards'

export interface KidAccessoryRow {
  accessorySlug: string
  equipped: boolean
}

export async function getAccessoriesForKid(supabase: SupabaseClient, kidId: string): Promise<KidAccessoryRow[]> {
  const { data, error } = await supabase.from('kid_accessories').select('accessory_slug, equipped').eq('kid_id', kidId)

  if (error) {
    throw new Error(`Failed to fetch accessories for kid ${kidId}: ${error.message}`)
  }

  return (data ?? []).map((row: { accessory_slug: string; equipped: boolean }) => ({
    accessorySlug: row.accessory_slug,
    equipped: row.equipped,
  }))
}

export async function purchaseAccessory(supabase: SupabaseClient, kidId: string, accessorySlug: string): Promise<void> {
  const accessory = ACCESSORIES.find((candidate) => candidate.slug === accessorySlug)
  if (!accessory) {
    throw new Error(`Unknown accessory: ${accessorySlug}`)
  }

  const owned = await getAccessoriesForKid(supabase, kidId)
  if (owned.some((row) => row.accessorySlug === accessorySlug)) {
    throw new Error(`Kid ${kidId} already owns ${accessorySlug}`)
  }

  const progress = await getProgressForKid(supabase, kidId)
  const lifetimeStars = computeLifetimeStars(progress)
  const spent = owned.reduce((sum, row) => {
    const ownedAccessory = ACCESSORIES.find((candidate) => candidate.slug === row.accessorySlug)
    return sum + (ownedAccessory?.cost ?? 0)
  }, 0)
  const balance = lifetimeStars - spent

  if (balance < accessory.cost) {
    throw new Error(`Kid ${kidId} cannot afford ${accessorySlug}: balance ${balance}, cost ${accessory.cost}`)
  }

  const { error } = await supabase
    .from('kid_accessories')
    .insert({ kid_id: kidId, accessory_slug: accessorySlug, equipped: true })

  if (error) {
    throw new Error(`Failed to purchase accessory ${accessorySlug}: ${error.message}`)
  }
}

export async function setAccessoryEquipped(
  supabase: SupabaseClient,
  kidId: string,
  accessorySlug: string,
  equipped: boolean
): Promise<void> {
  const owned = await getAccessoriesForKid(supabase, kidId)
  if (!owned.some((row) => row.accessorySlug === accessorySlug)) {
    throw new Error(`Kid ${kidId} does not own ${accessorySlug}`)
  }

  const { error } = await supabase
    .from('kid_accessories')
    .update({ equipped })
    .eq('kid_id', kidId)
    .eq('accessory_slug', accessorySlug)

  if (error) {
    throw new Error(`Failed to update accessory ${accessorySlug}: ${error.message}`)
  }
}
