import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { PET, ACCESSORIES } from '../content/rewards'

async function main() {
  const petImagePath = path.join(process.cwd(), 'content', 'images', 'pets', `${PET.slug}.png`)
  const petImageBuffer = readFileSync(petImagePath)
  const metadata = await sharp(petImageBuffer).metadata()
  const width = metadata.width ?? 512
  const height = metadata.height ?? 512

  const composites = await Promise.all(
    ACCESSORIES.map(async (accessory) => {
      const accessoryPath = path.join(process.cwd(), 'content', 'images', 'pets', 'accessories', `${accessory.slug}.png`)
      const accessoryBuffer = readFileSync(accessoryPath)
      const targetWidth = Math.round((accessory.widthPercent / 100) * width)
      const resized = await sharp(accessoryBuffer).resize(targetWidth).toBuffer()
      return {
        input: resized,
        left: Math.round((accessory.xPercent / 100) * width),
        top: Math.round((accessory.yPercent / 100) * height),
      }
    })
  )

  const output = await sharp(petImageBuffer).composite(composites).png().toBuffer()
  const outputPath = path.join(process.cwd(), 'content', 'images', 'pets', 'pet-debug.png')
  writeFileSync(outputPath, output)
  console.log(`Wrote debug composite to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
