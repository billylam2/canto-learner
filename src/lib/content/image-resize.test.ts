import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { resizeImage } from './image-resize'

describe('resizeImage', () => {
  it('resizes an image to the target dimensions and encodes as PNG', async () => {
    const input = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()

    const output = await resizeImage(input, 512)
    const metadata = await sharp(output).metadata()

    expect(metadata.width).toBe(512)
    expect(metadata.height).toBe(512)
    expect(metadata.format).toBe('png')
  })

  it('defaults to 512x512 when no size is given', async () => {
    const input = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer()

    const output = await resizeImage(input)
    const metadata = await sharp(output).metadata()

    expect(metadata.width).toBe(512)
    expect(metadata.height).toBe(512)
  })

  it('supports a non-square width and height for scene images', async () => {
    const input = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer()

    const output = await resizeImage(input, 800, 600)
    const metadata = await sharp(output).metadata()

    expect(metadata.width).toBe(800)
    expect(metadata.height).toBe(600)
    expect(metadata.format).toBe('png')
  })
})
