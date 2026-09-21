import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  createSegmentsBulk: vi.fn(),
}))

vi.mock('@/lib/dub-sync/transcribe', () => ({
  downloadAudio: vi.fn(),
  transcribeWithDiarization: vi.fn(),
  deleteAudioFile: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, createSegmentsBulk } from '@/lib/db/dub-sync'
import { downloadAudio, transcribeWithDiarization, deleteAudioFile } from '@/lib/dub-sync/transcribe'

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

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/auto-mark', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/auto-mark', () => {
  beforeEach(() => vi.clearAllMocks())

  it('transcribes both videos, pairs turns, and bulk-creates segments', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) => Promise.resolve(`/tmp/${videoId}.mp3`))
    vi.mocked(transcribeWithDiarization).mockImplementation((path: string) =>
      path.includes('canto-123')
        ? Promise.resolve([{ text: '你好', startTime: 10, endTime: 15, speakerTag: 1 }])
        : Promise.resolve([{ text: 'Hello', startTime: 21, endTime: 27, speakerTag: 1 }])
    )
    vi.mocked(createSegmentsBulk).mockResolvedValue([
      {
        id: 'seg-1',
        episodeId: 'ep-1',
        position: 0,
        label: null,
        cantoStart: 10,
        cantoEnd: 15,
        englishStart: 21,
        englishEnd: 27,
      },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.segments).toHaveLength(1)
    expect(body.warning).toBeUndefined()
    expect(createSegmentsBulk).toHaveBeenCalledWith(expect.anything(), 'ep-1', [
      { cantoStart: 10, cantoEnd: 15, englishStart: 21, englishEnd: 27 },
    ])
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
  })

  it('includes a warning when the turn counts do not match', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) => Promise.resolve(`/tmp/${videoId}.mp3`))
    vi.mocked(transcribeWithDiarization).mockImplementation((path: string) =>
      path.includes('canto-123')
        ? Promise.resolve([
            { text: '你好', startTime: 10, endTime: 15, speakerTag: 1 },
            { text: '喬治', startTime: 20, endTime: 25, speakerTag: 2 },
          ])
        : Promise.resolve([{ text: 'Hello', startTime: 21, endTime: 27, speakerTag: 1 }])
    )
    vi.mocked(createSegmentsBulk).mockResolvedValue([])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.warning).toContain('2')
    expect(body.warning).toContain('1')
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/auto-mark', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 400 when anchors are not fully set', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...episodeWithAnchors, englishContentEnd: null })
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(400)
  })

  it('returns 502 and still cleans up when a download fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) =>
      videoId === 'canto-123' ? Promise.reject(new Error('yt-dlp not found')) : Promise.resolve('/tmp/eng-456.mp3')
    )
    // The English side must still resolve successfully so this test deterministically exercises
    // the Cantonese download failure, rather than racing against an incidentally-unmocked call.
    vi.mocked(transcribeWithDiarization).mockResolvedValue([
      { text: 'Hello', startTime: 21, endTime: 27, speakerTag: 1 },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('canto-123')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
    expect(deleteAudioFile).not.toHaveBeenCalledWith(expect.stringContaining('canto-123'))
  })

  it('returns 502 and still cleans up both files when transcription fails on one side', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) => Promise.resolve(`/tmp/${videoId}.mp3`))
    vi.mocked(transcribeWithDiarization).mockImplementation((path: string) =>
      path.includes('eng-456')
        ? Promise.reject(new Error('Speech-to-Text quota exceeded'))
        : Promise.resolve([{ text: '你好', startTime: 10, endTime: 15, speakerTag: 1 }])
    )

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('eng-456')
    expect(body.error).toContain('quota exceeded')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
  })
})
