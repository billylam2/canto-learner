'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { loadYoutubeIframeApi } from '@/lib/dub-sync/youtube-iframe-api'
import type { YouTubePlayerLike } from '@/lib/dub-sync/player-controller'

export interface YoutubePlayerHandle extends YouTubePlayerLike {}

// YouTube IFrame API player state for "video finished playing" — see
// https://developers.google.com/youtube/iframe_api_reference#Playback_status
const YT_PLAYER_STATE_ENDED = 0

interface YoutubePlayerProps {
  videoId: string
  elementId: string
  onError?: () => void
  onEnded?: () => void
}

export const YoutubePlayer = forwardRef<YoutubePlayerHandle, YoutubePlayerProps>(function YoutubePlayer(
  { videoId, elementId, onError, onEnded },
  ref
) {
  const playerRef = useRef<YouTubePlayerLike | null>(null)
  const [ready, setReady] = useState(false)

  // Callers commonly pass inline arrow functions for these, which get a new identity on every
  // render. Reading them via refs (rather than depending on them directly) keeps the effect
  // below from tearing down and reconstructing the real YT.Player — and resetting playback — on
  // every unrelated re-render of the caller.
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded

  useEffect(() => {
    let cancelled = false
    loadYoutubeIframeApi().then(({ Player }) => {
      if (cancelled) return
      playerRef.current = new Player(elementId, {
        videoId,
        width: 960,
        height: 540,
        playerVars: { fs: 0 },
        events: {
          onReady: () => setReady(true),
          onError: () => onErrorRef.current?.(),
          onStateChange: (event) => {
            if (event.data === YT_PLAYER_STATE_ENDED) onEndedRef.current?.()
          },
        },
      })
    })
    return () => {
      cancelled = true
      // React (in dev StrictMode) mounts, unmounts, and remounts once to surface cleanup bugs.
      // Without destroying the player here, the first mount's iframe is never torn down before
      // the second mount targets the same element id, leaving a dangling node that later fails
      // a React removeChild call.
      if (typeof playerRef.current?.destroy === 'function') playerRef.current.destroy()
      playerRef.current = null
    }
  }, [elementId, videoId])

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
