import type { YouTubePlayerLike } from './player-controller'

export interface YouTubePlayerOptions {
  videoId: string
  events?: {
    onReady?: () => void
    onError?: () => void
  }
}

export interface YouTubePlayerConstructor {
  new (elementId: string, options: YouTubePlayerOptions): YouTubePlayerLike
}

declare global {
  interface Window {
    YT?: { Player: YouTubePlayerConstructor }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<{ Player: YouTubePlayerConstructor }> | null = null

export function loadYoutubeIframeApi(): Promise<{ Player: YouTubePlayerConstructor }> {
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }

    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      resolve(window.YT!)
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })

  return apiPromise
}

export function resetYoutubeIframeApiForTests(): void {
  apiPromise = null
}
