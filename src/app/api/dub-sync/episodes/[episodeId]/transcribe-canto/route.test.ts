import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  replaceCantoWords: vi.fn(),
}))

vi.mock('@/lib/dub-sync/transcribe', () => ({
  downloadAudio: vi.fn(),
  transcribeWords: vi.fn(),
  deleteAudioFile: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, replaceCantoWords } from '@/lib/db/dub-sync'
import { downloadAudio, transcribeWords, deleteAudioFile } from '@/lib/dub-sync/transcribe'

const episode = {
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
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/transcribe-canto', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/transcribe-canto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('downloads, transcribes, persists, and cleans up the audio file', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockResolvedValue('/tmp/canto-123.mp3')
    vi.mocked(transcribeWords).mockResolvedValue([{ text: '你好', startTime: 1, endTime: 1.5 }])
    vi.mocked(replaceCantoWords).mockResolvedValue([
      { id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1, endTime: 1.5 },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.words).toEqual([{ id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1, endTime: 1.5 }])
    expect(downloadAudio).toHaveBeenCalledWith('canto-123')
    expect(transcribeWords).toHaveBeenCalledWith('/tmp/canto-123.mp3', 'yue-Hant-HK')
    expect(replaceCantoWords).toHaveBeenCalledWith(expect.anything(), 'ep-1', [
      { text: '你好', startTime: 1, endTime: 1.5 },
    ])
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/transcribe-canto', {
      method: 'POST',
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 502 and still cleans up when the download fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockRejectedValue(new Error('yt-dlp not found'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('canto-123')
    expect(body.error).toContain('yt-dlp not found')
  })

  it('returns 502 and still cleans up when transcription fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockResolvedValue('/tmp/canto-123.mp3')
    vi.mocked(transcribeWords).mockRejectedValue(new Error('Speech-to-Text quota exceeded'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('quota exceeded')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
  })
})
