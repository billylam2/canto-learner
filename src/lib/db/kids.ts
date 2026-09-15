import type { SupabaseClient } from '@supabase/supabase-js'

export interface Kid {
  id: string
  username: string
  pin_hash: string
  failed_login_attempts: number
  locked_until: string | null
}

export async function findKidByUsername(
  supabase: SupabaseClient,
  username: string
): Promise<Kid | null> {
  const { data, error } = await supabase
    .from('kids')
    .select('id, username, pin_hash, failed_login_attempts, locked_until')
    .ilike('username', username)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to look up kid: ${error.message}`)
  }
  return data as Kid | null
}

export async function createKid(
  supabase: SupabaseClient,
  username: string,
  pinHash: string
): Promise<{ id: string; username: string }> {
  const { data, error } = await supabase
    .from('kids')
    .insert({ username, pin_hash: pinHash })
    .select('id, username')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create kid: ${error?.message ?? 'unknown error'}`)
  }
  return data as { id: string; username: string }
}

export async function recordFailedLogin(
  supabase: SupabaseClient,
  kidId: string,
  failedAttempts: number,
  lockedUntil: string | null
): Promise<void> {
  await supabase
    .from('kids')
    .update({ failed_login_attempts: failedAttempts, locked_until: lockedUntil })
    .eq('id', kidId)
}

export async function resetFailedLogins(supabase: SupabaseClient, kidId: string): Promise<void> {
  await supabase.from('kids').update({ failed_login_attempts: 0, locked_until: null }).eq('id', kidId)
}
