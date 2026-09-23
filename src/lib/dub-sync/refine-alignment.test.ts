import { describe, it, expect, vi } from 'vitest'
import { refineAlignment, REFINE_ALIGNMENT_WINDOW_SECONDS, REFINE_ALIGNMENT_FPS } from './refine-alignment'
import type { FrameHash } from './frame-hash'

function hashes(values: number[]): FrameHash[] {
  return values.map((v) => BigInt(v))
}

describe('refineAlignment', () => {
  it('suggests a corrected englishContentStart based on the discovered offset', async () => {
    // English hashes are the same sequence as canto's, but shifted 5 frames later, so the
    // true content-time match is 0.5s (at 10fps) after where englishContentStart was marked.
    const shared = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    const extractClipHashes = vi.fn(async ({ videoId }: { videoId: string }) => {
      if (videoId === 'canto-1') return hashes(shared.slice(0, 10))
      if (videoId === 'english-1') return hashes([0, 0, 0, 0, 0, ...shared.slice(0, 10)])
      throw new Error(`unexpected videoId ${videoId}`)
    })

    const result = await refineAlignment(
      {
        cantoneseVideoId: 'canto-1',
        englishVideoId: 'english-1',
        cantoTime: 20,
        englishTime: 18,
      },
      { extractClipHashes }
    )

    expect(result.offsetSeconds).toBeCloseTo(0.5, 5)
    expect(result.suggestedEnglishTime).toBeCloseTo(18.5, 5)
    expect(result.avgDistance).toBe(0)
    expect(result.confident).toBe(true)

    expect(extractClipHashes).toHaveBeenCalledWith({
      videoId: 'canto-1',
      centerSeconds: 20,
      windowSeconds: REFINE_ALIGNMENT_WINDOW_SECONDS,
      fps: REFINE_ALIGNMENT_FPS,
    })
    expect(extractClipHashes).toHaveBeenCalledWith({
      videoId: 'english-1',
      centerSeconds: 18,
      windowSeconds: REFINE_ALIGNMENT_WINDOW_SECONDS,
      fps: REFINE_ALIGNMENT_FPS,
    })
  })

  it('marks the result unconfident when the best match is still a poor match', async () => {
    // Every bit differs at every possible offset: no true alignment exists.
    const allZero = 0n
    const allOnes = (1n << 64n) - 1n
    const extractClipHashes = vi.fn(async ({ videoId }: { videoId: string }) => {
      if (videoId === 'canto-1') return [allZero, allZero, allZero, allZero]
      return [allOnes, allOnes, allOnes, allOnes]
    })

    const result = await refineAlignment(
      {
        cantoneseVideoId: 'canto-1',
        englishVideoId: 'english-1',
        cantoTime: 20,
        englishTime: 18,
      },
      { extractClipHashes }
    )

    expect(result.avgDistance).toBe(64)
    expect(result.confident).toBe(false)
  })

  it('is not confident when the best match sits exactly at the edge of the search window', async () => {
    // A "perfect" match (avgDistance 0) that only shows up at the very edge of the +/-2s search
    // window is a classic boundary artifact: it usually means the true match lies further out
    // than the window allows, not that this is a genuinely good alignment.
    const maxOffsetFrames = REFINE_ALIGNMENT_FPS * 2 // matches MAX_OFFSET_SECONDS in the module
    const cantoValues = Array.from({ length: maxOffsetFrames + 1 }, (_, i) => i)
    const fillerValues = Array(maxOffsetFrames).fill(9999)
    const extractClipHashes = vi.fn(async ({ videoId }: { videoId: string }) =>
      hashes(videoId === 'canto-1' ? cantoValues : [...fillerValues, ...cantoValues])
    )

    const result = await refineAlignment(
      { cantoneseVideoId: 'canto-1', englishVideoId: 'english-1', cantoTime: 20, englishTime: 18 },
      { extractClipHashes }
    )

    expect(result.offsetSeconds).toBeCloseTo(2, 5)
    expect(result.avgDistance).toBe(0)
    expect(result.confident).toBe(false)
  })

  it('propagates a clip-extraction failure (e.g. the download failed)', async () => {
    const extractClipHashes = vi.fn(async () => {
      throw new Error('yt-dlp exited with code 1')
    })

    await expect(
      refineAlignment(
        {
          cantoneseVideoId: 'canto-1',
          englishVideoId: 'english-1',
          cantoTime: 20,
          englishTime: 18,
        },
        { extractClipHashes }
      )
    ).rejects.toThrow(/yt-dlp/)
  })
})
