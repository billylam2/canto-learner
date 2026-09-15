import { describe, it, expect } from 'vitest'
import { COOKIE_NAME } from '@/lib/auth/session'
import { POST } from './route'

describe('POST /api/logout', () => {
  it('clears the session cookie', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(response.cookies.get(COOKIE_NAME)?.value).toBe('')
  })
})
