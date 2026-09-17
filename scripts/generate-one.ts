import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { generateImage, createImageGenDeps, DEFAULT_STYLE_SUFFIX } from '../src/lib/content/image-gen'
import { resizeImage } from '../src/lib/content/image-resize'

async function main() {
  const [, , outputPath, description, styleOverride] = process.argv
  if (!outputPath || !description) {
    throw new Error(
      'Usage: npm run generate-one -- <output-path.png> "<description>" ["<style override>"]'
    )
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT to your GCP project id before running this script')
  }

  const deps = createImageGenDeps()
  const style = styleOverride ?? DEFAULT_STYLE_SUFFIX
  console.log(`Generating "${description}" with style: ${style}`)
  const rawImage = await generateImage(projectId, description, deps, style)
  const resized = await resizeImage(rawImage)

  const resolvedPath = path.resolve(outputPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, resized)
  console.log(`Saved ${resolvedPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
