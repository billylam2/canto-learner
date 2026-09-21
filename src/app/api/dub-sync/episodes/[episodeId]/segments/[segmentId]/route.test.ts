import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  updateSegment: vi.fn(),
  deleteSegment: vi.fn(),
}))

import { PATCH, DELETE } from './route'
import { updateSegment, deleteSegment } from '@/lib/db/dub-sync'

const params = Promise.resolve({ episodeId: 'ep-1', segmentId: 'seg-1' })

describe('PATCH /api/dub-sync/episodes/[episodeId]/segments/[segmentId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the segment with only the provided fields', async () => {
    vi.mocked(updateSegment).mockResolvedValue({
      id: 'seg-1',
      episodeId: 'ep-1',
      position: 0,
      label: null,
      cantoStart: 12.5,
      cantoEnd: 16.0,
      englishStart: 10.0,
      englishEnd: 13.2,
    })

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments/seg-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoEnd: 16.0 }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(200)
    expect(updateSegment).toHaveBeenCalledWith(expect.anything(), 'seg-1', { cantoEnd: 16.0 })
  })
})

describe('DELETE /api/dub-sync/episodes/[episodeId]/segments/[segmentId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the segment', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments/seg-1', {
      method: 'DELETE',
    })
    const response = await DELETE(request, { params })
    expect(response.status).toBe(200)
    expect(deleteSegment).toHaveBeenCalledWith(expect.anything(), 'seg-1')
  })
})
