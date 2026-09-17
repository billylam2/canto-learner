import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createSupabaseServerClient } from '../src/lib/supabase/client'
import { createTtsClient, synthesizeCantonese } from '../src/lib/content/tts'
import { uploadAsset } from '../src/lib/content/storage'
import { upsertLevel, upsertVocabItem, linkVocabToLevel } from '../src/lib/db/content'
import { LEVELS, VOCAB_ITEMS } from '../content/vocab'

async function main() {
  const supabase = createSupabaseServerClient()
  const tts = createTtsClient()

  const requestedSlugs = process.argv.slice(2)
  const items = requestedSlugs.length > 0 ? VOCAB_ITEMS.filter((item) => requestedSlugs.includes(item.slug)) : VOCAB_ITEMS

  for (const level of LEVELS) {
    await upsertLevel(supabase, level)
    console.log(`Upserted level: ${level.name}`)
  }

  for (const item of items) {
    const audioOverridePath = path.join(process.cwd(), 'content', 'audio', `${item.slug}.mp3`)
    const audioBuffer = existsSync(audioOverridePath)
      ? readFileSync(audioOverridePath)
      : await synthesizeCantonese(tts, item.cantonese)
    const audioUrl = await uploadAsset(supabase, 'vocab-audio', `${item.slug}.mp3`, audioBuffer, 'audio/mpeg')

    const imagePath = path.join(process.cwd(), 'content', 'images', `${item.slug}.png`)
    const imageBuffer = readFileSync(imagePath)
    const imageUrl = await uploadAsset(supabase, 'vocab-images', `${item.slug}.png`, imageBuffer, 'image/png')

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

  console.log(`Done. Synced ${items.length} vocab items across ${LEVELS.length} levels.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
