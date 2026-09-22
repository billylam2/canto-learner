export type FrameHash = bigint

export function hammingDistance(a: FrameHash, b: FrameHash): number {
  let x = a ^ b
  let count = 0
  const one = BigInt(1)
  while (x) {
    count += Number(x & one)
    x >>= one
  }
  return count
}

const HASH_WIDTH = 9
const HASH_HEIGHT = 8
const FRAME_BYTES = HASH_WIDTH * HASH_HEIGHT

// Parses raw grayscale frames (fixed 9x8 bytes each, matching ffmpeg's
// `scale=9:8,format=gray` output) into difference hashes: for each row, one bit per
// adjacent pixel pair, set when the left pixel is darker than the right.
export function hashesFromRawGray9x8(buffer: Buffer): FrameHash[] {
  const hashes: FrameHash[] = []
  for (let offset = 0; offset + FRAME_BYTES <= buffer.length; offset += FRAME_BYTES) {
    let bits = BigInt(0)
    let bitIndex = BigInt(0)
    const one = BigInt(1)
    for (let row = 0; row < HASH_HEIGHT; row++) {
      for (let col = 0; col < HASH_WIDTH - 1; col++) {
        const left = buffer[offset + row * HASH_WIDTH + col]
        const right = buffer[offset + row * HASH_WIDTH + col + 1]
        if (left < right) bits |= one << bitIndex
        bitIndex++
      }
    }
    hashes.push(bits)
  }
  return hashes
}

export interface OffsetSearchResult {
  offsetFrames: number
  offsetSeconds: number
  avgDistance: number
}

// Finds the frame offset that best aligns compareHashes to baseHashes: the offset o
// minimizing the average Hamming distance between baseHashes[i] and compareHashes[i + o]
// over their overlap. Only offsets with at least minOverlapFrames of overlap are
// considered, so offsets near the edge of the search window (barely any overlapping
// frames) can't win by chance.
export function findBestOffset(
  baseHashes: FrameHash[],
  compareHashes: FrameHash[],
  fps: number,
  maxOffsetFrames: number,
  minOverlapFrames: number
): OffsetSearchResult | null {
  let best: OffsetSearchResult | null = null

  for (let offset = -maxOffsetFrames; offset <= maxOffsetFrames; offset++) {
    let total = 0
    let n = 0
    for (let i = 0; i < baseHashes.length; i++) {
      const j = i + offset
      if (j < 0 || j >= compareHashes.length) continue
      total += hammingDistance(baseHashes[i], compareHashes[j])
      n++
    }
    if (n < minOverlapFrames) continue
    const avgDistance = total / n
    if (best === null || avgDistance < best.avgDistance) {
      best = { offsetFrames: offset, offsetSeconds: offset / fps, avgDistance }
    }
  }

  return best
}
