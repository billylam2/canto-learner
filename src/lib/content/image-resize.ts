import sharp from 'sharp'

export async function resizeImage(buffer: Buffer, width = 512, height = width): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, height, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
