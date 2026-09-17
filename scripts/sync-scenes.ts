import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createSupabaseServerClient } from '../src/lib/supabase/client'
import { uploadAsset } from '../src/lib/content/storage'
import { upsertScene, upsertSceneObject } from '../src/lib/db/scenes'
import { SCENES, SCENE_OBJECTS } from '../content/scenes'

async function main() {
  const supabase = createSupabaseServerClient()

  const { data: vocabRows, error: vocabError } = await supabase.from('vocab_items').select('id, slug')
  if (vocabError) {
    throw new Error(`Failed to fetch vocab items: ${vocabError.message}`)
  }

  const vocabIdBySlug = new Map<string, string>()
  for (const row of (vocabRows ?? []) as Array<{ id: string; slug: string }>) {
    vocabIdBySlug.set(row.slug, row.id)
  }

  const requestedSlugs = process.argv.slice(2)
  const scenes = requestedSlugs.length > 0 ? SCENES.filter((scene) => requestedSlugs.includes(scene.slug)) : SCENES

  for (const scene of scenes) {
    const imagePath = path.join(process.cwd(), 'content', 'images', 'scenes', `${scene.slug}.png`)
    const imageBuffer = readFileSync(imagePath)
    const imageUrl = await uploadAsset(supabase, 'scene-images', `${scene.slug}.png`, imageBuffer, 'image/png')

    const { id: sceneId } = await upsertScene(supabase, {
      slug: scene.slug,
      levelId: scene.levelId,
      name: scene.name,
      imageUrl,
    })

    const objects = SCENE_OBJECTS.filter((object) => object.sceneSlug === scene.slug)
    for (const object of objects) {
      const vocabItemId = vocabIdBySlug.get(object.vocabSlug)
      if (!vocabItemId) {
        throw new Error(`Unknown vocab slug in scene object: ${object.vocabSlug}`)
      }
      await upsertSceneObject(supabase, {
        sceneId,
        vocabItemId,
        xPercent: object.xPercent,
        yPercent: object.yPercent,
        widthPercent: object.widthPercent,
        heightPercent: object.heightPercent,
      })
    }

    console.log(`Synced scene: ${scene.slug} (${objects.length} objects)`)
  }

  console.log(`Done. Synced ${scenes.length} scenes.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
