import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { generateImage, createImageGenDeps, DEFAULT_STYLE_SUFFIX } from '../src/lib/content/image-gen'
import { resizeImage } from '../src/lib/content/image-resize'
import { chromaKeyToTransparent, type RgbColor } from '../src/lib/content/image-transparency'

const CHROMA_STYLE_SUFFIX = `${DEFAULT_STYLE_SUFFIX}, isolated on a solid pure green background (#00FF00), no shadow, no other objects`

// The model reliably renders a uniform solid backdrop, but not always the
// exact requested color (its own lighting/style tends to tint it) — so the
// key color is sampled from the image's own corner pixel instead of assumed.
async function sampleCornerColor(buffer: Buffer): Promise<RgbColor> {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { r: data[0], g: data[1], b: data[2] }
}

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
  const keyColor = await sampleCornerColor(resized)
  console.log(`Sampled background color: rgb(${keyColor.r}, ${keyColor.g}, ${keyColor.b})`)
  // A generous tolerance: the model's backdrop is a soft radial gradient, not
  // a flat color, so the key must reach well past the sampled corner shade to
  // cover the center of the vignette too.
  const transparent = await chromaKeyToTransparent(resized, keyColor, 80)

  const resolvedPath = path.resolve(outputPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, transparent)
  console.log(`Saved ${resolvedPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
