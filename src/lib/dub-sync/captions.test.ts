import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCaptionTracks, pickCantoneseTrack, fetchCaptionCues, fetchCantoneseCaptionCues } from './captions'

const TRACK_LIST_XML = `<?xml version="1.0" encoding="utf-8" ?><transcript_list><track_list>
<track id="0" name="" lang_code="en" lang_original="English" lang_translated="English" lang_default="true"/>
<track id="1" name="" lang_code="zh-HK" lang_original="Chinese (Hong Kong)" lang_translated="Chinese" kind="asr"/>
</track_list></transcript_list>`

const CUES_JSON = JSON.stringify({
  events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: '你好' }] },
    { tStartMs: 4000, dDurationMs: 1500, segs: [{ utf8: '喬治' }, { utf8: '喊喇' }] },
    { tStartMs: 6000, segs: [{ utf8: '\n' }] },
  ],
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchCaptionTracks', () => {
  it('parses track lang codes and kinds from the timedtext list response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: () => Promise.resolve(TRACK_LIST_XML) } as Response)
    const tracks = await fetchCaptionTracks('video-1')
    expect(tracks).toEqual([
      { langCode: 'en', kind: 'standard' },
      { langCode: 'zh-HK', kind: 'asr' },
    ])
  })

  it('throws when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(fetchCaptionTracks('video-1')).rejects.toThrow('failed with status 500')
  })
})

describe('pickCantoneseTrack', () => {
  it('prefers an exact Cantonese lang code', () => {
    const tracks = [
      { langCode: 'en', kind: 'standard' as const },
      { langCode: 'zh-HK', kind: 'asr' as const },
    ]
    expect(pickCantoneseTrack(tracks)).toEqual({ langCode: 'zh-HK', kind: 'asr' })
  })

  it('falls back to any zh-prefixed track', () => {
    const tracks = [{ langCode: 'zh-TW', kind: 'standard' as const }]
    expect(pickCantoneseTrack(tracks)).toEqual({ langCode: 'zh-TW', kind: 'standard' })
  })

  it('returns null when no Chinese track exists', () => {
    expect(pickCantoneseTrack([{ langCode: 'en', kind: 'standard' }])).toBeNull()
  })
})

describe('fetchCaptionCues', () => {
  it('converts json3 events into cues in seconds, dropping empty/undurationed events', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: () => Promise.resolve(CUES_JSON) } as Response)
    const cues = await fetchCaptionCues('video-1', { langCode: 'zh-HK', kind: 'asr' })
    expect(cues).toEqual([
      { start: 1, end: 3, text: '你好' },
      { start: 4, end: 5.5, text: '喬治喊喇' },
    ])
  })
})

describe('fetchCantoneseCaptionCues', () => {
  it('picks the Cantonese track then fetches its cues', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(TRACK_LIST_XML) } as Response)
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(CUES_JSON) } as Response)
    const cues = await fetchCantoneseCaptionCues('video-1')
    expect(cues).toHaveLength(2)
  })

  it('throws when no Cantonese track is available', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          '<?xml version="1.0"?><transcript_list><track_list><track lang_code="en"/></track_list></transcript_list>'
        ),
    } as Response)
    await expect(fetchCantoneseCaptionCues('video-1')).rejects.toThrow('No Cantonese caption track found')
  })
})
