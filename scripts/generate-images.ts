import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { generateImage, createImageGenDeps } from '../src/lib/content/image-gen'
import { resizeImage } from '../src/lib/content/image-resize'
import { VOCAB_ITEMS } from '../content/vocab'

async function main() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT to your GCP project id before running this script')
  }

  const deps = createImageGenDeps()
  const outputDir = path.join(process.cwd(), 'content', 'images')
  mkdirSync(outputDir, { recursive: true })

  for (const item of VOCAB_ITEMS) {
    console.log(`Generating image for ${item.slug}: ${item.description}`)
    const rawImage = await generateImage(projectId, item.description, deps)
    const resized = await resizeImage(rawImage)
    writeFileSync(path.join(outputDir, `${item.slug}.png`), resized)
    console.log(`Saved ${item.slug}.png`)
  }

  console.log(`Done. Generated ${VOCAB_ITEMS.length} images in ${outputDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
