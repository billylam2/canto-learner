import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchYoutubeTitle } from './youtube-title'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchYoutubeTitle', () => {
  it('returns the title from the oEmbed response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: 'Muddy Puddles', author_name: 'Peppa Pig' }),
    } as Response)

    const title = await fetchYoutubeTitle('video-1')

    expect(title).toBe('Muddy Puddles')
    expect(fetch).toHaveBeenCalledWith(
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dvideo-1&format=json'
    )
  })

  it('throws a clear error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)

    await expect(fetchYoutubeTitle('missing-video')).rejects.toThrow(
      'Failed to fetch title for video missing-video: request failed with status 404'
    )
  })
})
