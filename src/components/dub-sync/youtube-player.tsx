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
      // The YouTube IFrame API's Player object exists immediately after construction, but its
      // methods aren't functional until the player's own onReady event fires — calling them
      // before that throws "X is not a function", so every call is guarded.
      seekTo: (seconds, allowSeekAhead) => {
        if (typeof playerRef.current?.seekTo === 'function') playerRef.current.seekTo(seconds, allowSeekAhead)
      },
      playVideo: () => {
        if (typeof playerRef.current?.playVideo === 'function') playerRef.current.playVideo()
      },
      pauseVideo: () => {
        if (typeof playerRef.current?.pauseVideo === 'function') playerRef.current.pauseVideo()
      },
      getCurrentTime: () =>
        typeof playerRef.current?.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : 0,
    }),
    []
  )

  return <div id={elementId} data-testid={`youtube-player-${elementId}`} data-ready={ready} />
})
