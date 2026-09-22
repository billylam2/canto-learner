export async function fetchYoutubeTitle(videoId: string): Promise<string> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`

  const response = await fetch(oembedUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch title for video ${videoId}: request failed with status ${response.status}`)
  }
  const data = await response.json()
  return data.title as string
}
