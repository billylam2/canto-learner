import { describe, it, expect } from 'vitest'
import { hammingDistance, hashesFromRawGray9x8, findBestOffset } from './frame-hash'

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance(0b1010n, 0b1010n)).toBe(0)
  })

  it('counts differing bits', () => {
    expect(hammingDistance(0b1111n, 0b1010n)).toBe(2)
  })
})

describe('hashesFromRawGray9x8', () => {
  it('produces one hash per 72-byte frame', () => {
    const frame = new Uint8Array(72).fill(100)
    const buffer = Buffer.from(frame)
    const hashes = hashesFromRawGray9x8(Buffer.concat([buffer, buffer, buffer]))
    expect(hashes).toHaveLength(3)
  })

  it('sets a bit when the left pixel is darker than the right pixel in each row', () => {
    // 9 columns x 8 rows, ascending left-to-right within every row -> every adjacent pair
    // has left < right, so every one of the 64 bits should be set.
    const row = [0, 10, 20, 30, 40, 50, 60, 70, 80]
    const frame = new Uint8Array(Array(8).fill(row).flat())
    const [hash] = hashesFromRawGray9x8(Buffer.from(frame))
    expect(hash).toBe((1n << 64n) - 1n)
  })

  it('drops a trailing partial frame', () => {
    const full = new Uint8Array(72).fill(1)
    const partial = new Uint8Array(10).fill(1)
    const hashes = hashesFromRawGray9x8(Buffer.concat([Buffer.from(full), Buffer.from(partial)]))
    expect(hashes).toHaveLength(1)
  })
})

describe('findBestOffset', () => {
  function hashAt(value: number): bigint {
    return BigInt(value)
  }

  it('finds the offset that best aligns two shifted sequences', () => {
    // compareHashes is baseHashes shifted 3 frames later (padded with a mismatching value).
    const baseHashes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(hashAt)
    const compareHashes = [99, 99, 99, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(hashAt)

    const result = findBestOffset(baseHashes, compareHashes, 10, 5, 3)

    expect(result).not.toBeNull()
    expect(result!.offsetFrames).toBe(3)
    expect(result!.offsetSeconds).toBeCloseTo(0.3, 5)
    expect(result!.avgDistance).toBe(0)
  })

  it('returns null when no offset has enough overlap', () => {
    const baseHashes = [1, 2].map(hashAt)
    const compareHashes = [1, 2].map(hashAt)

    const result = findBestOffset(baseHashes, compareHashes, 10, 1, 5)

    expect(result).toBeNull()
  })

  it('prefers the offset with lower average distance over exact matches with less overlap', () => {
    // At offset 0, everything matches closely (small consistent distance).
    // At offset 1, one pair matches exactly but overlap is smaller.
    const baseHashes = [0b0000n, 0b0001n, 0b0000n, 0b0001n]
    const compareHashes = [0b0000n, 0b0000n, 0b0000n, 0b0000n]

    const result = findBestOffset(baseHashes, compareHashes, 10, 1, 4)

    expect(result).not.toBeNull()
    expect(result!.offsetFrames).toBe(0)
  })
})
