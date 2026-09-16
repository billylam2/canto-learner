# Art Pipeline + Colors Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 31 hand-coded SVG icons with AI-generated cartoon illustrations, and add a new Colors level (8 words) using the same pipeline — playable immediately via the existing Listen & Tap game.

**Architecture:** A new `image-gen` utility calls Vertex AI's `gemini-2.5-flash-image` model over plain `fetch` (no new npm dependency for the API call itself — reuses the `gcloud` Application Default Credentials already set up in Plan 2), returning a base64-decoded PNG buffer. A `resizeImage` utility shrinks and compresses that via `sharp`. A generation script drives both across every vocabulary item — old and new — writing files into `content/images/` exactly like Plan 2's hand-authored SVGs did, so the rest of the pipeline (content-integrity test, `sync-content.ts`) barely changes.

**Tech Stack:** TypeScript, Vertex AI (`gemini-2.5-flash-image` via REST), `sharp`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-cantonese-kids-app-design.md`

## Global Constraints

- Every generated image's prompt is `${description}, cute flat cartoon illustration, thick black outlines, solid bright colors, simple white background, no text, centered` — the shared suffix is what keeps the whole art set visually cohesive.
- Images are generated at Gemini's native size (~1024x1024) and resized down to 512x512 PNG before being written to `content/images/` — full-size images are unnecessarily large for a 120x120 in-game display and would bloat the repo and Storage bandwidth.
- The image-generation API call must be dependency-injected (access-token getter + `fetch`) so it's unit-testable without real network/gcloud calls, matching the pattern already established for `synthesizeCantonese`/`createTtsClient` in Plan 2.
- Colors are a new Level 5 with `unlockThreshold: 90` — well above the four existing levels' Listen & Tap-only cumulative max (24+27+12+30 = 93 is the ceiling once every level is maxed, so 90 requires strong but not perfect play across all four, without touching those levels' own thresholds).
- No database schema changes are needed: `levels` and `vocab_items` already have the columns Colors needs (`category`, `cantonese_text`, `jyutping`, `english_gloss`, `image_url`, `audio_url`). `description` (the image prompt text) lives only in `content/vocab.ts` and the generation script — it is never written to the database.
- This plan does not touch the game UI at all — Colors becomes playable purely because `Level 5` and its `vocab_items` rows exist; `/play` and `/play/[levelId]` already work for any level driven by `content/vocab.ts`'s `LEVELS`.

---

## Task 1: Image Generation Utility

**Files:**
- Create: `src/lib/content/image-gen.ts`
- Test: `src/lib/content/image-gen.test.ts`

**Interfaces:**
- Produces: `ImageGenDeps` interface (`{ getAccessToken: () => string; fetchImpl: typeof fetch }`), `createImageGenDeps(): ImageGenDeps`, `generateImage(projectId: string, description: string, deps: ImageGenDeps): Promise<Buffer>` from `@/lib/content/image-gen` — consumed by Task 4's generation script.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/content/image-gen.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { generateImage, type ImageGenDeps } from './image-gen'

function makeDeps(overrides: { status?: number; body?: unknown; text?: string }): ImageGenDeps {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: (overrides.status ?? 200) < 300,
    status: overrides.status ?? 200,
    json: async () => overrides.body,
    text: async () => overrides.text ?? '',
  })
  return {
    getAccessToken: () => 'fake-token',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  }
}

describe('generateImage', () => {
  it('returns the decoded image buffer on success', async () => {
    const deps = makeDeps({
      body: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'here you go' },
                { inlineData: { mimeType: 'image/png', data: Buffer.from('fake-image').toString('base64') } },
              ],
            },
          },
        ],
      },
    })
    const result = await generateImage('proj-1', 'a cute cat', deps)
    expect(result.toString()).toBe('fake-image')
  })

  it('includes the shared style suffix and the description in the prompt', async () => {
    const deps = makeDeps({
      body: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('x').toString('base64') } }] } }] },
    })
    await generateImage('proj-1', 'a cute cat', deps)
    const call = vi.mocked(deps.fetchImpl).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    const prompt = body.contents[0].parts[0].text as string
    expect(prompt).toContain('a cute cat')
    expect(prompt).toContain('thick black outlines')
  })

  it('sends the request to the given project id', async () => {
    const deps = makeDeps({
      body: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('x').toString('base64') } }] } }] },
    })
    await generateImage('my-project-123', 'a cute cat', deps)
    const url = vi.mocked(deps.fetchImpl).mock.calls[0][0] as string
    expect(url).toContain('my-project-123')
    expect(url).toContain('gemini-2.5-flash-image')
  })

  it('throws when the API call fails', async () => {
    const deps = makeDeps({ status: 500, text: 'server error' })
    await expect(generateImage('proj-1', 'a cute cat', deps)).rejects.toThrow('Image generation failed')
  })

  it('throws when no image is returned', async () => {
    const deps = makeDeps({ body: { candidates: [{ content: { parts: [{ text: 'no image sorry' }] } }] } })
    await expect(generateImage('proj-1', 'a cute cat', deps)).rejects.toThrow('No image returned')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- image-gen.test.ts`
Expected: FAIL — `./image-gen` does not exist.

- [ ] **Step 3: Implement `src/lib/content/image-gen.ts`**

```ts
import { execFileSync } from 'node:child_process'

const MODEL = 'gemini-2.5-flash-image'
const REGION = 'us-central1'
const STYLE_SUFFIX =
  'cute flat cartoon illustration, thick black outlines, solid bright colors, simple white background, no text, centered'

export interface ImageGenDeps {
  getAccessToken: () => string
  fetchImpl: typeof fetch
}

export function createImageGenDeps(): ImageGenDeps {
  return {
    getAccessToken: () =>
      execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
        encoding: 'utf-8',
      }).trim(),
    fetchImpl: fetch,
  }
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
    }
  }>
}

export async function generateImage(projectId: string, description: string, deps: ImageGenDeps): Promise<Buffer> {
  const accessToken = deps.getAccessToken()
  const prompt = `${description}, ${STYLE_SUFFIX}`
  const url = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent`

  const response = await deps.fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Image generation failed for "${description}": ${response.status} ${await response.text()}`)
  }

  const data = (await response.json()) as GenerateContentResponse
  const imagePart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)

  if (!imagePart?.inlineData) {
    throw new Error(`No image returned for "${description}"`)
  }

  return Buffer.from(imagePart.inlineData.data, 'base64')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- image-gen.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/image-gen.ts src/lib/content/image-gen.test.ts
git commit -m "feat: add Vertex AI image generation utility"
```

---

## Task 2: Image Resize Utility

**Files:**
- Modify: `package.json` (add `sharp` dependency)
- Create: `src/lib/content/image-resize.ts`
- Test: `src/lib/content/image-resize.test.ts`

**Interfaces:**
- Produces: `resizeImage(buffer: Buffer, size?: number): Promise<Buffer>` from `@/lib/content/image-resize` — consumed by Task 4's generation script.

- [ ] **Step 1: Add the dependency**

Run: `npm install sharp@0.33.5`

(If this exact version has since been superseded, check `npm view sharp version` and use the current one — `sharp` ships frequent point releases.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/content/image-resize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { resizeImage } from './image-resize'

describe('resizeImage', () => {
  it('resizes an image to the target dimensions and encodes as PNG', async () => {
    const input = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()

    const output = await resizeImage(input, 512)
    const metadata = await sharp(output).metadata()

    expect(metadata.width).toBe(512)
    expect(metadata.height).toBe(512)
    expect(metadata.format).toBe('png')
  })

  it('defaults to 512x512 when no size is given', async () => {
    const input = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer()

    const output = await resizeImage(input)
    const metadata = await sharp(output).metadata()

    expect(metadata.width).toBe(512)
    expect(metadata.height).toBe(512)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- image-resize.test.ts`
Expected: FAIL — `./image-resize` does not exist.

- [ ] **Step 4: Implement `src/lib/content/image-resize.ts`**

```ts
import sharp from 'sharp'

export async function resizeImage(buffer: Buffer, size = 512): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- image-resize.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/content/image-resize.ts src/lib/content/image-resize.test.ts
git commit -m "feat: add image resize utility"
```

---

## Task 3: Colors Content and Art Regeneration

**Files:**
- Modify: `content/vocab.ts` (add `description` field throughout, add Level 5 + 8 color items)
- Modify: `content/vocab.test.ts` (update image-check extension and counts)
- Create: `scripts/generate-images.ts`
- Delete: `content/images/*.svg` (all 31 files, once their `.png` replacements exist)

**Interfaces:**
- Consumes: `generateImage`, `createImageGenDeps` (`@/lib/content/image-gen`), `resizeImage` (`@/lib/content/image-resize`).
- Produces: `VocabSourceItem.description: string` (new required field), a 5th entry in `LEVELS`, 8 new entries in `VOCAB_ITEMS` — consumed by Task 4 (`sync-content.ts` already reads `LEVELS`/`VOCAB_ITEMS` and needs no interface changes, just an extension/content-type fix).

- [ ] **Step 1: Add `description` to the `VocabSourceItem` interface and every existing entry**

In `content/vocab.ts`, update the interface and category type:

```ts
export type VocabCategory = 'greetings' | 'people' | 'family' | 'descriptors' | 'animals' | 'numbers' | 'colors'

export interface VocabSourceItem {
  slug: string
  category: VocabCategory
  level: number
  cantonese: string
  jyutping: string
  englishGloss: string
  description: string
  homophoneGroup?: string
}
```

Add a `description` field to each of the 31 existing entries in `VOCAB_ITEMS` (add the property; don't change anything else about these lines):

```ts
  { slug: 'hello', category: 'greetings', level: 1, cantonese: '你好', jyutping: 'nei5 hou2', englishGloss: 'hello', description: 'a cartoon hand waving hello' },
  { slug: 'hello-everyone', category: 'greetings', level: 1, cantonese: '大家好', jyutping: 'daai6 gaa1 hou2', englishGloss: 'hello everyone', description: 'three cartoon friends waving hello together' },
  { slug: 'good-morning', category: 'greetings', level: 1, cantonese: '早晨', jyutping: 'zou2 san4', englishGloss: 'good morning', description: 'a bright cartoon sun rising over hills' },
  { slug: 'good-evening', category: 'greetings', level: 1, cantonese: '晚安', jyutping: 'maan5 on1', englishGloss: 'good evening', description: 'a cartoon crescent moon with stars at night' },
  { slug: 'goodbye', category: 'greetings', level: 1, cantonese: '拜拜', jyutping: 'baai1 baai3', englishGloss: 'goodbye', description: 'a cartoon hand waving goodbye' },
  { slug: 'thank-you', category: 'greetings', level: 1, cantonese: '唔該', jyutping: 'm4 goi1', englishGloss: 'thank you', description: 'two cartoon hands pressed together in a thank-you gesture' },
  { slug: 'excuse-me', category: 'greetings', level: 1, cantonese: '唔好意思', jyutping: 'm4 hou2 ji3 si1', englishGloss: 'excuse me', description: 'a cartoon hand raised politely asking for attention' },
  { slug: 'sorry', category: 'greetings', level: 1, cantonese: '對唔住', jyutping: 'deoi3 m4 zyu6', englishGloss: 'sorry', description: 'a cute cartoon face looking sorry with one small tear' },
  { slug: 'i-me', category: 'people', level: 2, cantonese: '我', jyutping: 'ngo5', englishGloss: 'I / me', description: 'a cartoon child pointing to themselves' },
  { slug: 'you', category: 'people', level: 2, cantonese: '你', jyutping: 'nei5', englishGloss: 'you', description: 'a cartoon child pointing forward at the viewer' },
  { slug: 'teacher', category: 'people', level: 2, cantonese: '老師', jyutping: 'lou5 si1', englishGloss: 'teacher', description: 'a friendly cartoon teacher standing next to a chalkboard' },
  { slug: 'mom', category: 'family', level: 2, cantonese: '媽媽', jyutping: 'maa4 maa1', englishGloss: 'mom', description: 'a cartoon mom with a small heart nearby' },
  { slug: 'dad', category: 'family', level: 2, cantonese: '爸爸', jyutping: 'baa4 baa1', englishGloss: 'dad', description: 'a cartoon dad with a small heart nearby' },
  { slug: 'older-brother', category: 'family', level: 2, cantonese: '哥哥', jyutping: 'go4 go1', englishGloss: 'older brother', description: 'a cartoon older brother, a taller boy' },
  { slug: 'younger-brother', category: 'family', level: 2, cantonese: '弟弟', jyutping: 'dai4 dai2', englishGloss: 'younger brother', description: 'a cartoon younger brother, a small boy' },
  { slug: 'older-sister', category: 'family', level: 2, cantonese: '姐姐', jyutping: 'ze4 ze1', englishGloss: 'older sister', description: 'a cartoon older sister, a taller girl with a bow in her hair' },
  { slug: 'younger-sister', category: 'family', level: 2, cantonese: '妹妹', jyutping: 'mui4 mui2', englishGloss: 'younger sister', description: 'a cartoon younger sister, a small girl with a bow in her hair' },
  { slug: 'big', category: 'descriptors', level: 3, cantonese: '大', jyutping: 'daai6', englishGloss: 'big', description: 'a very large cartoon circle' },
  { slug: 'small', category: 'descriptors', level: 3, cantonese: '細', jyutping: 'sai3', englishGloss: 'small', description: 'a very small cartoon circle' },
  { slug: 'cat', category: 'animals', level: 3, cantonese: '貓', jyutping: 'maau1', englishGloss: 'cat', description: 'a cute cartoon cat sitting down' },
  { slug: 'dog', category: 'animals', level: 3, cantonese: '狗', jyutping: 'gau2', englishGloss: 'dog', description: 'a cute cartoon dog sitting down', homophoneGroup: 'gau2' },
  { slug: 'number-1', category: 'numbers', level: 4, cantonese: '一', jyutping: 'jat1', englishGloss: 'one', description: 'the numeral 1 with one small dot below it' },
  { slug: 'number-2', category: 'numbers', level: 4, cantonese: '二', jyutping: 'ji6', englishGloss: 'two', description: 'the numeral 2 with two small dots below it' },
  { slug: 'number-3', category: 'numbers', level: 4, cantonese: '三', jyutping: 'saam1', englishGloss: 'three', description: 'the numeral 3 with three small dots below it' },
  { slug: 'number-4', category: 'numbers', level: 4, cantonese: '四', jyutping: 'sei3', englishGloss: 'four', description: 'the numeral 4 with four small dots below it' },
  { slug: 'number-5', category: 'numbers', level: 4, cantonese: '五', jyutping: 'ng5', englishGloss: 'five', description: 'the numeral 5 with five small dots below it' },
  { slug: 'number-6', category: 'numbers', level: 4, cantonese: '六', jyutping: 'luk6', englishGloss: 'six', description: 'the numeral 6 with six small dots below it' },
  { slug: 'number-7', category: 'numbers', level: 4, cantonese: '七', jyutping: 'cat1', englishGloss: 'seven', description: 'the numeral 7 with seven small dots below it' },
  { slug: 'number-8', category: 'numbers', level: 4, cantonese: '八', jyutping: 'baat3', englishGloss: 'eight', description: 'the numeral 8 with eight small dots below it' },
  { slug: 'number-9', category: 'numbers', level: 4, cantonese: '九', jyutping: 'gau2', englishGloss: 'nine', description: 'the numeral 9 with nine small dots below it', homophoneGroup: 'gau2' },
  { slug: 'number-10', category: 'numbers', level: 4, cantonese: '十', jyutping: 'sap6', englishGloss: 'ten', description: 'the numeral 10 with ten small dots below it' },
```

- [ ] **Step 2: Add Level 5 and the 8 color entries**

In `LEVELS`:

```ts
  { id: 5, name: 'Colors', order: 5, unlockThreshold: 90 },
```

In `VOCAB_ITEMS` (append at the end):

```ts
  // Level 5: Colors
  { slug: 'color-red', category: 'colors', level: 5, cantonese: '紅色', jyutping: 'hung4 sik1', englishGloss: 'red', description: 'a solid red paint splotch blob shape' },
  { slug: 'color-orange', category: 'colors', level: 5, cantonese: '橙色', jyutping: 'caang2 sik1', englishGloss: 'orange', description: 'a solid orange paint splotch blob shape' },
  { slug: 'color-yellow', category: 'colors', level: 5, cantonese: '黃色', jyutping: 'wong4 sik1', englishGloss: 'yellow', description: 'a solid yellow paint splotch blob shape' },
  { slug: 'color-green', category: 'colors', level: 5, cantonese: '綠色', jyutping: 'luk6 sik1', englishGloss: 'green', description: 'a solid green paint splotch blob shape' },
  { slug: 'color-blue', category: 'colors', level: 5, cantonese: '藍色', jyutping: 'laam4 sik1', englishGloss: 'blue', description: 'a solid blue paint splotch blob shape' },
  { slug: 'color-purple', category: 'colors', level: 5, cantonese: '紫色', jyutping: 'zi2 sik1', englishGloss: 'purple', description: 'a solid purple paint splotch blob shape' },
  { slug: 'color-black', category: 'colors', level: 5, cantonese: '黑色', jyutping: 'hak1 sik1', englishGloss: 'black', description: 'a solid black paint splotch blob shape' },
  { slug: 'color-white', category: 'colors', level: 5, cantonese: '白色', jyutping: 'baak6 sik1', englishGloss: 'white', description: 'a solid white paint splotch blob shape with a thin light gray outline so it is visible on a white background' },
```

- [ ] **Step 3: Update the failing content test**

In `content/vocab.test.ts`, update the item-count and level-count assertions, and change the image-existence check to `.png`:

```ts
  it('has exactly 39 items', () => {
    expect(VOCAB_ITEMS.length).toBe(39)
  })
```

```ts
  it('has 5 levels in ascending order', () => {
    expect(LEVELS.map((level) => level.order)).toEqual([1, 2, 3, 4, 5])
  })
```

```ts
describe('vocab images', () => {
  it('has a matching PNG image file for every item', () => {
    for (const item of VOCAB_ITEMS) {
      const imagePath = path.resolve(import.meta.dirname, 'images', `${item.slug}.png`)
      expect(existsSync(imagePath)).toBe(true)
    }
  })
})
```

Also add a test confirming every item has a non-empty `description`, alongside the existing non-empty-field checks:

```ts
  it('has a non-empty description for every item', () => {
    for (const item of VOCAB_ITEMS) {
      expect(item.description.length).toBeGreaterThan(0)
    }
  })
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- vocab.test.ts`
Expected: FAIL — no `.png` files exist yet (only the old `.svg` files).

- [ ] **Step 5: Implement `scripts/generate-images.ts`**

```ts
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
```

- [ ] **Step 6: Add the npm script**

Add to `package.json`'s `"scripts"` block:

```json
    "generate-images": "tsx --env-file=.env.local scripts/generate-images.ts"
```

- [ ] **Step 7: Set your GCP project id locally**

In `.env.local`, add:

```
GOOGLE_CLOUD_PROJECT=<your-gcp-project-id>
```

Use the same project you enabled the Text-to-Speech API on in Plan 2 (find it with `gcloud config get-value project`).

- [ ] **Step 8: Run the generation script**

Make sure `gcloud` is on your `PATH` for this terminal session (e.g. `export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"` on macOS with Homebrew) and that you're logged in (`gcloud auth application-default login`, done once in Plan 2).

Run: `npm run generate-images`

Expected: console output for all 39 items, ending with `Done. Generated 39 images in .../content/images`. This calls a paid API 39 times — costs are small (Gemini 2.5 Flash Image is priced per image, well under a dollar total for this batch) but real.

- [ ] **Step 9: Visually review the generated images**

Open a handful of the new `content/images/*.png` files (at least a few from each category — a greeting, a family member, a number, a color) and confirm they look like reasonable, on-style illustrations of their word with no readable text baked into the image. If any look wrong or low-quality, re-run just that item by temporarily editing `VOCAB_ITEMS` to a single-item array, running the script, then reverting — or simply re-run the full script (it's idempotent; regenerating is cheap).

- [ ] **Step 10: Delete the old SVG files**

Run: `rm content/images/*.svg`

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npm test -- vocab.test.ts`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add content/vocab.ts content/vocab.test.ts content/images scripts/generate-images.ts package.json
git commit -m "feat: regenerate vocab art via Gemini and add Colors level"
```

Note: this commits 39 PNG files (roughly 512x512 each) — expect a repo size increase of a few megabytes, consistent with the SVGs they replace being much smaller but the tradeoff being worth it for real illustrations.

---

## Task 4: Update Content Sync for PNG and Push Live

**Files:**
- Modify: `scripts/sync-content.ts`

**Interfaces:** None — this task only changes file extension/content-type literals; no function signatures change.

- [ ] **Step 1: Update the image path and content type**

In `scripts/sync-content.ts`, change:

```ts
    const imagePath = path.join(process.cwd(), 'content', 'images', `${item.slug}.svg`)
    const imageBuffer = readFileSync(imagePath)
    const imageUrl = await uploadAsset(supabase, 'vocab-images', `${item.slug}.svg`, imageBuffer, 'image/svg+xml')
```

to:

```ts
    const imagePath = path.join(process.cwd(), 'content', 'images', `${item.slug}.png`)
    const imageBuffer = readFileSync(imagePath)
    const imageUrl = await uploadAsset(supabase, 'vocab-images', `${item.slug}.png`, imageBuffer, 'image/png')
```

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-content.ts
git commit -m "feat: sync PNG images and content type in content sync script"
```

- [ ] **Step 4: Run the sync against your live Supabase project**

Run: `npm run sync-content`

Expected: console output for all 5 levels and all 39 vocab items, ending with `Done. Synced 39 vocab items across 5 levels.` This re-uploads every image (old vocab_items rows get their `image_url` overwritten to point at the new PNGs, uploaded to the same `vocab-images` bucket) and adds the new Colors level and its 8 words.

- [ ] **Step 5: Verify in Supabase and in the app**

In the Supabase Table Editor, confirm `levels` has 5 rows and `vocab_items` has 39 rows, all with non-null `image_url` ending in `.png`. In the Storage `vocab-images` bucket, confirm old `.svg` objects are still there alongside new `.png` ones (uploading under a new filename doesn't delete the old one — that's fine, they're just unused now) and that opening a `.png` URL directly in a browser shows the new artwork. Then log into the live app, visit `/play`, and confirm a 5th "Colors" entry appears (locked, since no kid can have 90 stars yet) and that Level 1 (Greetings) now shows the new cartoon art instead of the old flat-color icons when played.

---

## Plan Complete

At the end of this plan: every vocabulary item's illustration is a cohesive AI-generated cartoon (not hand-coded SVG), and a new Colors level is live and playable through the existing Listen & Tap game. This unblocks Plan 4b (Find-in-Scene), which will reuse this same `image-gen`/`resizeImage` pipeline to generate multi-entity scene illustrations.
