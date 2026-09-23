import { findBestOffset, type FrameHash } from './frame-hash'

// How far before/after each rough mark to sample frames from. Kept small and local so this
// only ever refines the boundary the admin already marked, rather than search the whole
// video — important for videos that bundle several episodes together, where a global search
// could snap to the wrong boundary.
export const REFINE_ALIGNMENT_WINDOW_SECONDS = 3
export const REFINE_ALIGNMENT_FPS = 10
const MAX_OFFSET_SECONDS = 2
const MIN_OVERLAP_FRACTION = 0.5
// Two random 64-bit hashes differ in ~32 bits on average, so a real content match (typically
// single digits in practice) sits far below this — comfortably separating "found the boundary"
// from "these two clips don't actually line up on anything."
const CONFIDENT_AVG_DISTANCE_THRESHOLD = 15

// Generic over content start OR content end: both are just "a rough mark on each video that
// should line up frame-accurately," so the same cross-correlation applies to either boundary.
export interface RefineAlignmentInput {
  cantoneseVideoId: string
  englishVideoId: string
  cantoTime: number
  englishTime: number
}

export interface RefineAlignmentResult {
  suggestedEnglishTime: number
  offsetSeconds: number
  avgDistance: number
  confident: boolean
}

export interface ExtractClipHashesOptions {
  videoId: string
  centerSeconds: number
  windowSeconds: number
  fps: number
}

export interface RefineAlignmentDeps {
  extractClipHashes: (options: ExtractClipHashesOptions) => Promise<FrameHash[]>
}

// The Cantonese mark is treated as fixed (the admin marks it first); this only ever suggests a
// correction to the English mark so the two line up frame-accurately.
export async function refineAlignment(
  input: RefineAlignmentInput,
  deps: RefineAlignmentDeps
): Promise<RefineAlignmentResult> {
  const [cantoHashes, englishHashes] = await Promise.all([
    deps.extractClipHashes({
      videoId: input.cantoneseVideoId,
      centerSeconds: input.cantoTime,
      windowSeconds: REFINE_ALIGNMENT_WINDOW_SECONDS,
      fps: REFINE_ALIGNMENT_FPS,
    }),
    deps.extractClipHashes({
      videoId: input.englishVideoId,
      centerSeconds: input.englishTime,
      windowSeconds: REFINE_ALIGNMENT_WINDOW_SECONDS,
      fps: REFINE_ALIGNMENT_FPS,
    }),
  ])

  const maxOffsetFrames = Math.round(MAX_OFFSET_SECONDS * REFINE_ALIGNMENT_FPS)
  const minOverlapFrames = Math.round(cantoHashes.length * MIN_OVERLAP_FRACTION)
  const best = findBestOffset(cantoHashes, englishHashes, REFINE_ALIGNMENT_FPS, maxOffsetFrames, minOverlapFrames)

  if (best === null) {
    throw new Error('Could not find a confident alignment within the search window')
  }

  // When the best match found sits exactly at the edge of the search window, that's usually a
  // sign the true match lies further out than the window allows — the search was cut off before
  // it could converge, not because it found a genuinely good match. A low avgDistance doesn't
  // save this case: with real footage, some frame near the edge frequently looks "good enough"
  // by chance, which is exactly the false-positive this guards against.
  const hitSearchBoundary = Math.abs(best.offsetFrames) === maxOffsetFrames

  return {
    suggestedEnglishTime: input.englishTime + best.offsetSeconds,
    offsetSeconds: best.offsetSeconds,
    avgDistance: best.avgDistance,
    confident: best.avgDistance < CONFIDENT_AVG_DISTANCE_THRESHOLD && !hitSearchBoundary,
  }
}
