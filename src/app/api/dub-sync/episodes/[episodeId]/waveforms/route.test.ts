import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  replaceWaveforms: vi.fn(),
}))

vi.mock('@/lib/dub-sync/download-audio', () => ({
  downloadAudio: vi.fn(),
  deleteAudioFile: vi.fn(),
}))

vi.mock('@/lib/dub-sync/waveform', () => ({
  extractWaveformPeaks: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, replaceWaveforms } from '@/lib/db/dub-sync'
import { downloadAudio, deleteAudioFile } from '@/lib/dub-sync/download-audio'
import { extractWaveformPeaks } from '@/lib/dub-sync/waveform'

const episode = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/waveforms', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/waveforms', () => {
  beforeEach(() => vi.clearAllMocks())

  it('downloads both videos, extracts peaks, and replaces the stored waveforms', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockImplementation(async (videoId) => `/tmp/${videoId}.mp3`)
    vi.mocked(extractWaveformPeaks).mockImplementation(async (path) =>
      path.includes('canto-123') ? [0.1, 0.2] : [0.3, 0.4]
    )
    vi.mocked(replaceWaveforms).mockResolvedValue([
      { id: 'wf-1', episodeId: 'ep-1', language: 'canto', peaks: [0.1, 0.2] },
      { id: 'wf-2', episodeId: 'ep-1', language: 'english', peaks: [0.3, 0.4] },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    expect(downloadAudio).toHaveBeenCalledWith('canto-123')
    expect(downloadAudio).toHaveBeenCalledWith('eng-456')
    expect(replaceWaveforms).toHaveBeenCalledWith(expect.anything(), 'ep-1', [
      { language: 'canto', peaks: [0.1, 0.2] },
      { language: 'english', peaks: [0.3, 0.4] },
    ])
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
    const body = await response.json()
    expect(body.waveforms).toHaveLength(2)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 502 and still cleans up when audio download fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockRejectedValue(new Error('yt-dlp exited with code 1'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toMatch(/canto-123/)
    expect(replaceWaveforms).not.toHaveBeenCalled()
  })

  it('returns 502 when peak extraction fails, and still deletes the downloaded file', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockResolvedValue('/tmp/canto-123.mp3')
    vi.mocked(extractWaveformPeaks).mockRejectedValue(new Error('ffmpeg exited with code 1'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/waveforms', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
