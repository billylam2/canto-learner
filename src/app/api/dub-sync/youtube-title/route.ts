import { NextRequest, NextResponse } from 'next/server'
import { fetchYoutubeTitle } from '@/lib/dub-sync/youtube-title'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const videoId = request.nextUrl.searchParams.get('videoId')
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
  }

  try {
    const title = await fetchYoutubeTitle(videoId)
    return NextResponse.json({ title })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 })
  }
}
