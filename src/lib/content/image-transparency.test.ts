import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { chromaKeyToTransparent } from './image-transparency'

describe('chromaKeyToTransparent', () => {
  it('makes pixels matching the key color fully transparent', async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer()

    const output = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 })
    const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

    expect(info.channels).toBe(4)
    expect(data[3]).toBe(0)
  })

  it('keeps pixels outside the tolerance fully opaque', async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer()

    const output = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 })
    const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

    expect(data[3]).toBe(255)
  })

  it('respects a custom tolerance', async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 20, g: 235, b: 20 } },
    })
      .png()
      .toBuffer()

    const strict = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 }, 5)
    const strictPixel = await sharp(strict).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(strictPixel.data[3]).toBe(255)

    const loose = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 }, 40)
    const loosePixel = await sharp(loose).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(loosePixel.data[3]).toBe(0)
  })
})
