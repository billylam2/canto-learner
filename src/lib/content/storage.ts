import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadAsset(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
  })

  if (error) {
    throw new Error(`Failed to upload ${path} to ${bucket}: ${error.message}`)
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path)
  return publicUrlData.publicUrl
}
