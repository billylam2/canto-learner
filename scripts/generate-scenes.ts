import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { generateImage, createImageGenDeps } from '../src/lib/content/image-gen'
import { resizeImage } from '../src/lib/content/image-resize'
import { SCENES } from '../content/scenes'

const SCENE_STYLE_SUFFIX = 'cute flat cartoon illustration, thick black outlines, solid bright colors, no text'

async function main() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT to your GCP project id before running this script')
  }

  const deps = createImageGenDeps()
  const outputDir = path.join(process.cwd(), 'content', 'images', 'scenes')
  mkdirSync(outputDir, { recursive: true })

  for (const scene of SCENES) {
    console.log(`Generating scene image for ${scene.slug}: ${scene.description}`)
    const rawImage = await generateImage(projectId, scene.description, deps, SCENE_STYLE_SUFFIX)
    const resized = await resizeImage(rawImage, 800, 600)
    writeFileSync(path.join(outputDir, `${scene.slug}.png`), resized)
    console.log(`Saved ${scene.slug}.png`)
  }

  console.log(`Done. Generated ${SCENES.length} scene images in ${outputDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
