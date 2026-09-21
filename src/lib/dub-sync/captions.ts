export interface CaptionTrack {
  langCode: string
  kind: 'asr' | 'standard'
}

export interface CaptionCue {
  start: number
  end: number
  text: string
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`)
  }
  return response.text()
}

export async function fetchCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const xml = await fetchText(`https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`)
  const tracks: CaptionTrack[] = []
  const trackTagPattern = /<track\b[^>]*\/>/g
  const langCodePattern = /lang_code="([^"]*)"/
  const kindPattern = /kind="([^"]*)"/

  for (const match of xml.matchAll(trackTagPattern)) {
    const tag = match[0]
    const langCode = langCodePattern.exec(tag)?.[1]
    if (!langCode) continue
    const kind: CaptionTrack['kind'] = kindPattern.exec(tag)?.[1] === 'asr' ? 'asr' : 'standard'
    tracks.push({ langCode, kind })
  }

  return tracks
}

const CANTONESE_LANG_CODES = ['yue', 'zh-HK', 'zh-Hant-HK']

export function pickCantoneseTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  for (const preferredCode of CANTONESE_LANG_CODES) {
    const match = tracks.find((track) => track.langCode === preferredCode)
    if (match) return match
  }
  return tracks.find((track) => track.langCode.startsWith('zh')) ?? null
}

interface Json3Event {
  tStartMs: number
  dDurationMs?: number
  segs?: Array<{ utf8: string }>
}

interface Json3Response {
  events?: Json3Event[]
}

export async function fetchCaptionCues(videoId: string, track: CaptionTrack): Promise<CaptionCue[]> {
  const params = new URLSearchParams({ v: videoId, lang: track.langCode, fmt: 'json3' })
  if (track.kind === 'asr') {
    params.set('kind', 'asr')
  }
  const json = await fetchText(`https://www.youtube.com/api/timedtext?${params.toString()}`)
  const parsed = JSON.parse(json) as Json3Response

  return (parsed.events ?? [])
    .filter(
      (event): event is Json3Event & { dDurationMs: number; segs: Array<{ utf8: string }> } =>
        event.dDurationMs !== undefined && !!event.segs && event.segs.length > 0
    )
    .map((event) => ({
      start: event.tStartMs / 1000,
      end: (event.tStartMs + event.dDurationMs) / 1000,
      text: event.segs
        .map((seg) => seg.utf8)
        .join('')
        .trim(),
    }))
    .filter((cue) => cue.text.length > 0)
}

export async function fetchCantoneseCaptionCues(videoId: string): Promise<CaptionCue[]> {
  const tracks = await fetchCaptionTracks(videoId)
  const track = pickCantoneseTrack(tracks)
  if (!track) {
    throw new Error(`No Cantonese caption track found for video ${videoId}`)
  }
  return fetchCaptionCues(videoId, track)
}
