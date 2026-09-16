import sharp from 'sharp'

export async function resizeImage(buffer: Buffer, size = 512): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
