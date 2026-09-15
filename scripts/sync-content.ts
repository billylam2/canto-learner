import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createSupabaseServerClient } from '../src/lib/supabase/client'
import { createTtsClient, synthesizeCantonese } from '../src/lib/content/tts'
import { uploadAsset } from '../src/lib/content/storage'
import { upsertLevel, upsertVocabItem, linkVocabToLevel } from '../src/lib/db/content'
import { LEVELS, VOCAB_ITEMS } from '../content/vocab'

async function main() {
  const supabase = createSupabaseServerClient()
  const tts = createTtsClient()

  for (const level of LEVELS) {
    await upsertLevel(supabase, level)
    console.log(`Upserted level: ${level.name}`)
  }

  for (const item of VOCAB_ITEMS) {
    const audioBuffer = await synthesizeCantonese(tts, item.cantonese)
    const audioUrl = await uploadAsset(supabase, 'vocab-audio', `${item.slug}.mp3`, audioBuffer, 'audio/mpeg')

    const imagePath = path.join(process.cwd(), 'content', 'images', `${item.slug}.svg`)
    const imageBuffer = readFileSync(imagePath)
    const imageUrl = await uploadAsset(supabase, 'vocab-images', `${item.slug}.svg`, imageBuffer, 'image/svg+xml')

    const vocabItem = await upsertVocabItem(supabase, {
      slug: item.slug,
      category: item.category,
      cantoneseText: item.cantonese,
      jyutping: item.jyutping,
      englishGloss: item.englishGloss,
      homophoneGroup: item.homophoneGroup ?? null,
      audioUrl,
      imageUrl,
    })

    await linkVocabToLevel(supabase, item.level, vocabItem.id)
    console.log(`Synced vocab item: ${item.slug}`)
  }

  console.log(`Done. Synced ${VOCAB_ITEMS.length} vocab items across ${LEVELS.length} levels.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
