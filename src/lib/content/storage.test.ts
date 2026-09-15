import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadAsset } from './storage'

function makeSupabaseMock(uploadError: { message: string } | null, publicUrl: string) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError })
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl } })
  const from = vi.fn().mockReturnValue({ upload, getPublicUrl })
  return { storage: { from } } as unknown as SupabaseClient
}

describe('uploadAsset', () => {
  it('uploads the file and returns its public URL', async () => {
    const supabase = makeSupabaseMock(
      null,
      'https://example.supabase.co/storage/v1/object/public/vocab-audio/hello.mp3'
    )
    const url = await uploadAsset(supabase, 'vocab-audio', 'hello.mp3', Buffer.from([1]), 'audio/mpeg')
    expect(url).toBe('https://example.supabase.co/storage/v1/object/public/vocab-audio/hello.mp3')
  })

  it('throws when the upload fails', async () => {
    const supabase = makeSupabaseMock({ message: 'bucket not found' }, '')
    await expect(
      uploadAsset(supabase, 'vocab-audio', 'hello.mp3', Buffer.from([1]), 'audio/mpeg')
    ).rejects.toThrow('Failed to upload hello.mp3 to vocab-audio: bucket not found')
  })
})
