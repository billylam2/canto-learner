import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createSupabaseServerClient } from '../src/lib/supabase/client'
import { uploadAsset } from '../src/lib/content/storage'
import { PET, ACCESSORIES } from '../content/rewards'

async function main() {
  const supabase = createSupabaseServerClient()

  const petImagePath = path.join(process.cwd(), 'content', 'images', 'pets', `${PET.slug}.png`)
  const petImageBuffer = readFileSync(petImagePath)
  await uploadAsset(supabase, 'pet-images', `${PET.slug}.png`, petImageBuffer, 'image/png')
  console.log(`Synced pet: ${PET.slug}`)

  for (const accessory of ACCESSORIES) {
    const imagePath = path.join(process.cwd(), 'content', 'images', 'pets', 'accessories', `${accessory.slug}.png`)
    const imageBuffer = readFileSync(imagePath)
    await uploadAsset(supabase, 'accessory-images', `${accessory.slug}.png`, imageBuffer, 'image/png')
    console.log(`Synced accessory: ${accessory.slug}`)
  }

  console.log(`Done. Synced 1 pet and ${ACCESSORIES.length} accessories.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
