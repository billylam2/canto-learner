import { describe, it, expect, afterEach } from 'vitest'
import { createSupabaseServerClient } from './client'

describe('createSupabaseServerClient', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  })

  it('throws when environment variables are missing', () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => createSupabaseServerClient()).toThrow(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    )
  })

  it('creates a client when environment variables are present', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    expect(() => createSupabaseServerClient()).not.toThrow()
  })
})
