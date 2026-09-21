'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { loadYoutubeIframeApi } from '@/lib/dub-sync/youtube-iframe-api'
import type { YouTubePlayerLike } from '@/lib/dub-sync/player-controller'

export interface YoutubePlayerHandle extends YouTubePlayerLike {}

interface YoutubePlayerProps {
  videoId: string
  elementId: string
  onError?: () => void
}

export const YoutubePlayer = forwardRef<YoutubePlayerHandle, YoutubePlayerProps>(function YoutubePlayer(
  { videoId, elementId, onError },
  ref
) {
  const playerRef = useRef<YouTubePlayerLike | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadYoutubeIframeApi().then(({ Player }) => {
      if (cancelled) return
      playerRef.current = new Player(elementId, {
        videoId,
        events: { onReady: () => setReady(true), onError: () => onError?.() },
      })
    })
    return () => {
      cancelled = true
    }
  }, [elementId, videoId, onError])

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (seconds, allowSeekAhead) => playerRef.current?.seekTo(seconds, allowSeekAhead),
      playVideo: () => playerRef.current?.playVideo(),
      pauseVideo: () => playerRef.current?.pauseVideo(),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    }),
    []
  )

  return <div id={elementId} data-testid={`youtube-player-${elementId}`} data-ready={ready} />
})
