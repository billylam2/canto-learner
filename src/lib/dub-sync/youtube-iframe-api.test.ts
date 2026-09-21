import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadYoutubeIframeApi, resetYoutubeIframeApiForTests } from './youtube-iframe-api'

beforeEach(() => {
  resetYoutubeIframeApiForTests()
  document.head.innerHTML = ''
  delete (window as unknown as { YT?: unknown }).YT
  delete (window as unknown as { onYouTubeIframeAPIReady?: unknown }).onYouTubeIframeAPIReady
})

describe('loadYoutubeIframeApi', () => {
  it('appends the iframe API script tag', () => {
    void loadYoutubeIframeApi()
    const script = document.head.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    expect(script).not.toBeNull()
  })

  it('resolves once window.onYouTubeIframeAPIReady fires', async () => {
    const promise = loadYoutubeIframeApi()
    const fakePlayerCtor = vi.fn()
    window.YT = { Player: fakePlayerCtor as unknown as new (...args: never[]) => never }
    window.onYouTubeIframeAPIReady?.()
    await expect(promise).resolves.toEqual({ Player: fakePlayerCtor })
  })

  it('only appends one script tag across multiple calls', () => {
    void loadYoutubeIframeApi()
    void loadYoutubeIframeApi()
    const scripts = document.head.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')
    expect(scripts).toHaveLength(1)
  })

  it('resolves immediately if window.YT is already present', async () => {
    window.YT = { Player: vi.fn() as unknown as new (...args: never[]) => never }
    await expect(loadYoutubeIframeApi()).resolves.toBe(window.YT)
  })
})
