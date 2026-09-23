import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  listResyncCheckpoints: vi.fn(),
  updateResyncCheckpoint: vi.fn(),
  deleteResyncCheckpoint: vi.fn(),
}))

import { PATCH, DELETE } from './route'
import { getEpisode, listResyncCheckpoints, updateResyncCheckpoint, deleteResyncCheckpoint } from '@/lib/db/dub-sync'

const params = Promise.resolve({ episodeId: 'ep-1', checkpointId: 'chk-1' })

const episodeWithAnchors = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

const existingCheckpoint = { id: 'chk-1', episodeId: 'ep-1', cantoTime: 60, englishTime: 100 }
const otherCheckpoint = { id: 'chk-2', episodeId: 'ep-1', cantoTime: 90, englishTime: 150 }

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

describe('PATCH /api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the checkpoint, excluding itself from the collision check', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([existingCheckpoint, otherCheckpoint])
    vi.mocked(updateResyncCheckpoint).mockResolvedValue({ ...existingCheckpoint, cantoTime: 65 })

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 65 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(200)
    expect(updateResyncCheckpoint).toHaveBeenCalledWith(expect.anything(), 'chk-1', { cantoTime: 65 })
  })

  it('returns 400 with the validation message when the edit collides with another checkpoint', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([existingCheckpoint, otherCheckpoint])

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 90 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('A checkpoint already exists at that Cantonese time')
    expect(updateResyncCheckpoint).not.toHaveBeenCalled()
  })

  it('returns 404 when the checkpoint being edited is not found', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([otherCheckpoint])

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 65 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await PATCH(request, { params })
    expect(response.status).toBe(404)
  })

  it('rejects an unauthenticated PATCH', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 65 }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await PATCH(request, { params })
    expect(response.status).toBe(401)
  })
})

describe('DELETE /api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the checkpoint', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'DELETE',
      headers: { cookie: await adminCookieHeader() },
    })
    const response = await DELETE(request, { params })
    expect(response.status).toBe(200)
    expect(deleteResyncCheckpoint).toHaveBeenCalledWith(expect.anything(), 'chk-1')
  })

  it('rejects an unauthenticated DELETE', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'DELETE',
    })
    const response = await DELETE(request, { params })
    expect(response.status).toBe(401)
  })
})
