import sharp from 'sharp'

export interface RgbColor {
  r: number
  g: number
  b: number
}

export async function chromaKeyToTransparent(buffer: Buffer, keyColor: RgbColor, tolerance = 40): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const distance = Math.sqrt((r - keyColor.r) ** 2 + (g - keyColor.g) ** 2 + (b - keyColor.b) ** 2)
    if (distance <= tolerance) {
      data[i + 3] = 0
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
