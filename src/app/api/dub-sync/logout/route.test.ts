import { describe, it, expect } from 'vitest'
import { ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'
import { POST } from './route'

describe('POST /api/dub-sync/logout', () => {
  it('clears the admin session cookie', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(response.cookies.get(ADMIN_COOKIE_NAME)?.value).toBe('')
  })
})
