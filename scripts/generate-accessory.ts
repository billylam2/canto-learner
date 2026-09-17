import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { generateImage, createImageGenDeps, DEFAULT_STYLE_SUFFIX } from '../src/lib/content/image-gen'
import { resizeImage } from '../src/lib/content/image-resize'
import { chromaKeyToTransparent } from '../src/lib/content/image-transparency'

const KEY_COLOR = { r: 0, g: 255, b: 0 }
const CHROMA_STYLE_SUFFIX = `${DEFAULT_STYLE_SUFFIX}, isolated on a solid pure green background (#00FF00), no shadow, no other objects`

async function main() {
  const [, , outputPath, description] = process.argv
  if (!outputPath || !description) {
    throw new Error('Usage: npm run generate-accessory -- <output-path.png> "<description>"')
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT to your GCP project id before running this script')
  }

  const deps = createImageGenDeps()
  console.log(`Generating "${description}" on a chroma-key background`)
  const raw = await generateImage(projectId, description, deps, CHROMA_STYLE_SUFFIX)
  const resized = await resizeImage(raw, 512)
  const transparent = await chromaKeyToTransparent(resized, KEY_COLOR)

  const resolvedPath = path.resolve(outputPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, transparent)
  console.log(`Saved ${resolvedPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
