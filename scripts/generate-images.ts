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

  const requestedSlugs = process.argv.slice(2)
  const items =
    requestedSlugs.length > 0 ? VOCAB_ITEMS.filter((item) => requestedSlugs.includes(item.slug)) : VOCAB_ITEMS

  const failedSlugs: string[] = []

  for (const item of items) {
    console.log(`Generating image for ${item.slug}: ${item.description}`)
    try {
      const rawImage = await generateImage(projectId, item.description, deps)
      const resized = await resizeImage(rawImage)
      writeFileSync(path.join(outputDir, `${item.slug}.png`), resized)
      console.log(`Saved ${item.slug}.png`)
    } catch (error) {
      console.error(`Failed to generate ${item.slug}: ${(error as Error).message}`)
      failedSlugs.push(item.slug)
    }
  }

  console.log(`Done. Generated ${items.length - failedSlugs.length}/${items.length} images in ${outputDir}`)
  if (failedSlugs.length > 0) {
    console.log(`Failed: ${failedSlugs.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
