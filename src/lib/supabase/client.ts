import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
