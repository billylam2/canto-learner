import type { YouTubePlayerLike } from './player-controller'

export interface YouTubePlayerOptions {
  videoId: string
  width?: number
  height?: number
  playerVars?: {
    // Disables YouTube's own fullscreen button: it fullscreens only the single iframe clicked,
    // which breaks our Cantonese/English video-swap technique (fullscreen stays locked to
    // whichever iframe was fullscreened, so swapping visibility to the other video just freezes
    // the fullscreened one). The player page provides its own fullscreen control instead, which
    // fullscreens both iframes' shared container so the swap keeps working.
    fs?: 0 | 1
  }
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
