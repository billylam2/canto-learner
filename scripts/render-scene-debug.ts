import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { SCENES, SCENE_OBJECTS } from '../content/scenes'

async function main() {
  const sceneSlug = process.argv[2]
  if (!sceneSlug) {
    throw new Error('Usage: tsx scripts/render-scene-debug.ts <scene-slug>')
  }

  const scene = SCENES.find((candidate) => candidate.slug === sceneSlug)
  if (!scene) {
    throw new Error(`Unknown scene slug: ${sceneSlug}`)
  }

  const imagePath = path.join(process.cwd(), 'content', 'images', 'scenes', `${sceneSlug}.png`)
  const imageBuffer = readFileSync(imagePath)
  const metadata = await sharp(imageBuffer).metadata()
  const width = metadata.width ?? 800
  const height = metadata.height ?? 600

  const objects = SCENE_OBJECTS.filter((object) => object.sceneSlug === sceneSlug)
  const rects = objects
    .map((object) => {
      const x = (object.xPercent / 100) * width
      const y = (object.yPercent / 100) * height
      const w = (object.widthPercent / 100) * width
      const h = (object.heightPercent / 100) * height
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="red" stroke-width="4" />` +
        `<text x="${x + 4}" y="${y + 20}" fill="red" font-size="20" font-family="sans-serif">${object.vocabSlug}</text>`
      )
    })
    .join('')

  const svgOverlay = Buffer.from(`<svg width="${width}" height="${height}">${rects}</svg>`)
  const output = await sharp(imageBuffer)
    .composite([{ input: svgOverlay }])
    .png()
    .toBuffer()

  const outputPath = path.join(process.cwd(), 'content', 'images', 'scenes', `${sceneSlug}-debug.png`)
  writeFileSync(outputPath, output)
  console.log(`Wrote debug overlay to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
