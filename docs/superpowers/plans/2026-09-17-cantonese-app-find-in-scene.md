# Find-in-Scene Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second game type, "Find in the Scene," where a kid taps the correct object inside a multi-entity AI-generated illustration, for Levels 2 (People & Family), 3 (Descriptors & Animals), and 5 (Colors).

**Architecture:** New `scenes`/`scene_objects` tables hold one or more raster scene images per level plus percentage-based tap-region ("hotspot") rectangles for each vocab item depicted in that scene. Scene art is generated with the same Gemini/Vertex AI pipeline built in the Art Pipeline plan (`src/lib/content/image-gen.ts` + `image-resize.ts`), extended to support a scene-appropriate style suffix and a wider aspect ratio. Hotspot coordinates are hand-authored by visually inspecting each generated scene (no automatic object detection). A new client component (`SceneGame`) reuses the session/progress/star patterns of the existing `ListenTapGame`, but scores taps by point-in-rectangle hit testing instead of multiple choice, and asks about each scene's items in a fixed (non-randomized) order to avoid the hydration-mismatch class of bug fixed earlier in this project.

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript, Supabase (Postgres + Storage), Vitest 5, `sharp` for image processing, `gemini-2.5-flash-image` on Vertex AI via existing `gcloud` ADC auth.

**Spec:** `docs/superpowers/specs/2026-09-14-cantonese-kids-app-design.md` (master spec) and the design decisions recorded below (this plan is self-sufficient; no separate content-authoring conversation is needed).

## Global Constraints

- Node ≥22.13.0, run all scripts with the project's pinned nvm version.
- Scripts that read `.env.local` must be invoked via `tsx --env-file=.env.local <script>` (mirrors `generate-images`/`sync-content` in `package.json`) — `tsx` does not auto-load `.env.local` the way Next.js does.
- Any randomization inside a server-rendered Client Component MUST use the existing `createSeededRandom`/`shuffleItems` utilities (`src/lib/game/round.ts`), never bare `Math.random()`, to avoid server/client hydration mismatches. This plan avoids the need entirely by asking about a scene's items in a **fixed order** (array/insertion order) — no randomization is introduced by this plan.
- Star scoring matches the existing Listen & Tap game exactly: 3 stars for a first-try-correct answer, 1 star after any retry, saved via the existing generic `POST /api/progress` endpoint with a `gameType` string (`'find-scene'` for this feature) — no API route changes needed.
- Supabase tables use RLS enabled with no policies (service-role-only access from server code), matching `levels`/`vocab_items`/`level_vocab`/`progress`. Storage buckets are public-read.
- Reuse `uploadAsset` (`src/lib/content/storage.ts`), `createSupabaseServerClient` (`src/lib/supabase/client.ts`), and the DI pattern established in `image-gen.ts` (`ImageGenDeps` with injectable `getAccessToken`/`fetchImpl`) for any new content-pipeline code.
- Shared art style suffix for vocab icons (unchanged): `'cute flat cartoon illustration, thick black outlines, solid bright colors, simple white background, no text, centered'`. Scenes use a **different** suffix (no "simple white background" — scenes need real backgrounds): `'cute flat cartoon illustration, thick black outlines, solid bright colors, no text'`.

---

## Design: Scene Content

Three scenes, one per eligible level, generated via the same Vertex AI pipeline as vocab icons:

| Scene slug | Level | Description (image-gen prompt) | Vocab items depicted |
|---|---|---|---|
| `scene-dog-cat` | 3 (Descriptors & Animals) | "a big brown dog and a small orange cat playing together in a backyard" | `dog`, `cat`, `big`, `small` |
| `scene-colors-balloons` | 5 (Colors) | "eight colorful balloons in a row, each a different solid color: red, orange, yellow, green, blue, purple, black, and white" | `color-red`, `color-orange`, `color-yellow`, `color-green`, `color-blue`, `color-purple`, `color-black`, `color-white` |
| `scene-family` (default) | 2 (People & Family) | "a family of six, mom, dad, and four children of different ages, posing together at home, with their teacher visiting" | `teacher`, `mom`, `dad`, `older-brother`, `younger-brother`, `older-sister`, `younger-sister` |

Level 2 explicitly excludes `i-me` and `you` — pronouns with no stable physical depiction, so they cannot be tap targets in a scene.

**Level 2 fallback (only if the single `scene-family` image comes out visually unclear):** if, after generating and reviewing `scene-family.png`, the 7 figures are not each clearly visually distinguishable from one another (e.g. two children look identical, a figure is entirely hidden/overlapping another), replace the single scene with two scenes instead:

| Scene slug | Level | Description | Vocab items depicted |
|---|---|---|---|
| `scene-family-home` | 2 | "a mom, a dad, an older brother, and an older sister posing together at home" | `mom`, `dad`, `older-brother`, `older-sister` |
| `scene-family-school` | 2 | "a younger brother, a younger sister, and their teacher standing together at school" | `younger-brother`, `younger-sister`, `teacher` |

This is a judgment call made while actually looking at the generated image (Task 3) — not decided in advance.

---

### Task 1: Scene-aware image generation and resizing

**Files:**
- Modify: `src/lib/content/image-gen.ts`
- Modify: `src/lib/content/image-resize.ts`
- Test: `src/lib/content/image-gen.test.ts`
- Test: `src/lib/content/image-resize.test.ts`

**Interfaces:**
- Consumes: nothing new (extends existing `generateImage`/`resizeImage`).
- Produces: `generateImage(projectId: string, description: string, deps: ImageGenDeps, styleSuffix?: string): Promise<Buffer>` (4th param, optional, defaults to the existing vocab-icon suffix — fully backward compatible with all existing callers). `resizeImage(buffer: Buffer, width?: number, height?: number): Promise<Buffer>` (2nd param renamed in effect from `size` to `width`, 3rd param `height` defaults to `width` — fully backward compatible: `resizeImage(buf)` and `resizeImage(buf, 512)` behave identically to before). `DEFAULT_STYLE_SUFFIX` exported as a named constant (was an unexported `STYLE_SUFFIX`).

- [ ] **Step 1: Write the failing tests for the style-suffix override**

Add to `src/lib/content/image-gen.test.ts` (append inside the existing `describe('generateImage', ...)` block, after the last `it`):

```ts
  it('uses a custom style suffix when one is provided, instead of the default', async () => {
    const deps = makeDeps({
      body: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('x').toString('base64') } }] } }] },
    })
    await generateImage('proj-1', 'a big dog and small cat', deps, 'flat cartoon style, no text')
    const call = vi.mocked(deps.fetchImpl).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    const prompt = body.contents[0].parts[0].text as string
    expect(prompt).toContain('a big dog and small cat')
    expect(prompt).toContain('flat cartoon style, no text')
    expect(prompt).not.toContain('simple white background')
  })
```

Also add, near the top of the file, an import-level check that `DEFAULT_STYLE_SUFFIX` is exported:

```ts
import { generateImage, DEFAULT_STYLE_SUFFIX, type ImageGenDeps } from './image-gen'
```

(replace the existing `import { generateImage, type ImageGenDeps } from './image-gen'` line with this one), and add one more test to the `describe('generateImage', ...)` block:

```ts
  it('exports the default style suffix used by vocab-icon generation', () => {
    expect(DEFAULT_STYLE_SUFFIX).toContain('simple white background')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- image-gen`
Expected: FAIL — `DEFAULT_STYLE_SUFFIX` is not exported, and `generateImage` does not accept a 4th argument (existing tests still pass since the signature change is additive, but the two new tests fail).

- [ ] **Step 3: Implement the style-suffix override in `image-gen.ts`**

Replace the top of `src/lib/content/image-gen.ts`:

```ts
import { execFileSync } from 'node:child_process'

const MODEL = 'gemini-2.5-flash-image'
const REGION = 'us-central1'
export const DEFAULT_STYLE_SUFFIX =
  'cute flat cartoon illustration, thick black outlines, solid bright colors, simple white background, no text, centered'
```

Replace the `generateImage` signature and its first two lines:

```ts
export async function generateImage(
  projectId: string,
  description: string,
  deps: ImageGenDeps,
  styleSuffix: string = DEFAULT_STYLE_SUFFIX
): Promise<Buffer> {
  const accessToken = deps.getAccessToken()
  const prompt = `${description}, ${styleSuffix}`
```

Leave the rest of the function body unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- image-gen`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Write the failing test for width/height resizing**

Add to `src/lib/content/image-resize.test.ts` (append inside `describe('resizeImage', ...)`, after the last `it`):

```ts
  it('supports a non-square width and height for scene images', async () => {
    const input = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer()

    const output = await resizeImage(input, 800, 600)
    const metadata = await sharp(output).metadata()

    expect(metadata.width).toBe(800)
    expect(metadata.height).toBe(600)
    expect(metadata.format).toBe('png')
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- image-resize`
Expected: FAIL — `resizeImage(input, 800, 600)` currently ignores the 3rd argument (uses `width` for both dimensions), so `metadata.height` is `800`, not `600`.

- [ ] **Step 7: Implement width/height support in `image-resize.ts`**

Replace the full contents of `src/lib/content/image-resize.ts`:

```ts
import sharp from 'sharp'

export async function resizeImage(buffer: Buffer, width = 512, height = width): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, height, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- image-resize`
Expected: PASS (all tests, old and new)

- [ ] **Step 9: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/content/image-gen.ts src/lib/content/image-gen.test.ts src/lib/content/image-resize.ts src/lib/content/image-resize.test.ts
git commit -m "feat: support custom style suffix and non-square dimensions for scene image generation"
```

---

### Task 2: Scene database schema and scene metadata content

**Files:**
- Create: `supabase/migrations/0004_create_scenes.sql`
- Create: `content/scenes.ts`
- Test: `content/scenes.test.ts`

**Interfaces:**
- Consumes: `LEVELS`, `VOCAB_ITEMS` from `content/vocab.ts` (for cross-referencing in tests).
- Produces: `SceneSource` and `SceneObjectSource` types, `SCENES: SceneSource[]`, `SCENE_OBJECTS: SceneObjectSource[]` (empty in this task — populated in Task 3) from `content/scenes.ts`. DB tables `scenes` (columns: `id serial primary key`, `slug text unique`, `level_id integer references levels(id)`, `name text`, `image_url text`, `created_at timestamptz`) and `scene_objects` (columns: `id serial primary key`, `scene_id integer references scenes(id)`, `vocab_item_id uuid references vocab_items(id)`, `x_percent real`, `y_percent real`, `width_percent real`, `height_percent real`, `created_at timestamptz`, unique on `(scene_id, vocab_item_id)`). Storage bucket `scene-images` (public read).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_create_scenes.sql`:

```sql
create table scenes (
  id serial primary key,
  slug text not null unique,
  level_id integer not null references levels(id) on delete cascade,
  name text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table scene_objects (
  id serial primary key,
  scene_id integer not null references scenes(id) on delete cascade,
  vocab_item_id uuid not null references vocab_items(id) on delete cascade,
  x_percent real not null,
  y_percent real not null,
  width_percent real not null,
  height_percent real not null,
  created_at timestamptz not null default now(),
  unique (scene_id, vocab_item_id)
);

alter table scenes enable row level security;
alter table scene_objects enable row level security;

insert into storage.buckets (id, name, public) values ('scene-images', 'scene-images', true);

create policy "scene-images is publicly readable" on storage.objects
  for select using (bucket_id = 'scene-images');
```

- [ ] **Step 2: Write the failing test for scene metadata**

Create `content/scenes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LEVELS, VOCAB_ITEMS } from './vocab'
import { SCENES, SCENE_OBJECTS } from './scenes'

describe('scene content', () => {
  it('has a unique slug for every scene', () => {
    const slugs = SCENES.map((scene) => scene.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('references only levels that exist', () => {
    const levelIds = new Set(LEVELS.map((level) => level.id))
    for (const scene of SCENES) {
      expect(levelIds.has(scene.levelId)).toBe(true)
    }
  })

  it('has a non-empty name and description for every scene', () => {
    for (const scene of SCENES) {
      expect(scene.name.length).toBeGreaterThan(0)
      expect(scene.description.length).toBeGreaterThan(0)
    }
  })

  it('has at least one scene for levels 2, 3, and 5', () => {
    const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
    expect(levelIdsWithScenes.has(2)).toBe(true)
    expect(levelIdsWithScenes.has(3)).toBe(true)
    expect(levelIdsWithScenes.has(5)).toBe(true)
  })

  it('has no scenes for levels 1 and 4', () => {
    const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
    expect(levelIdsWithScenes.has(1)).toBe(false)
    expect(levelIdsWithScenes.has(4)).toBe(false)
  })

  it('references only scene slugs and vocab slugs that exist', () => {
    const sceneSlugs = new Set(SCENES.map((scene) => scene.slug))
    const vocabSlugs = new Set(VOCAB_ITEMS.map((item) => item.slug))
    for (const object of SCENE_OBJECTS) {
      expect(sceneSlugs.has(object.sceneSlug)).toBe(true)
      expect(vocabSlugs.has(object.vocabSlug)).toBe(true)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- content/scenes`
Expected: FAIL with a module-not-found error for `./scenes` — `content/scenes.ts` does not exist yet.

- [ ] **Step 4: Create `content/scenes.ts`**

```ts
export interface SceneSource {
  slug: string
  levelId: number
  name: string
  description: string
}

export interface SceneObjectSource {
  sceneSlug: string
  vocabSlug: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export const SCENES: SceneSource[] = [
  {
    slug: 'scene-dog-cat',
    levelId: 3,
    name: 'Dog and Cat',
    description: 'a big brown dog and a small orange cat playing together in a backyard',
  },
  {
    slug: 'scene-colors-balloons',
    levelId: 5,
    name: 'Colorful Balloons',
    description:
      'eight colorful balloons in a row, each a different solid color: red, orange, yellow, green, blue, purple, black, and white',
  },
  {
    slug: 'scene-family',
    levelId: 2,
    name: 'Family and Teacher',
    description: 'a family of six, mom, dad, and four children of different ages, posing together at home, with their teacher visiting',
  },
]

// Populated in the content-authoring task, after each scene image above has
// been generated and visually inspected — hotspot coordinates cannot be
// known before the raster image exists.
export const SCENE_OBJECTS: SceneObjectSource[] = []
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- content/scenes`
Expected: PASS

- [ ] **Step 6: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0004_create_scenes.sql content/scenes.ts content/scenes.test.ts
git commit -m "feat: add scenes/scene_objects schema and scene metadata content"
```

---

### Task 3: Generate scene art and author tap-region hotspots

**Files:**
- Create: `scripts/generate-scenes.ts`
- Create: `scripts/render-scene-debug.ts`
- Modify: `content/scenes.ts` (populate `SCENE_OBJECTS`, and possibly replace `scene-family` with the two-scene fallback — see Design section above)
- Modify: `content/scenes.test.ts` (add coverage-completeness tests)
- Create: `content/images/scenes/*.png` (generated art, one file per scene slug)

**Interfaces:**
- Consumes: `SCENES` from `content/scenes.ts` (Task 2), `generateImage`/`createImageGenDeps` from `src/lib/content/image-gen.ts` (Task 1), `resizeImage` from `src/lib/content/image-resize.ts` (Task 1), `VOCAB_ITEMS` from `content/vocab.ts`.
- Produces: fully populated `SCENE_OBJECTS` array in `content/scenes.ts`; PNG files at `content/images/scenes/<scene-slug>.png` matching every `SCENES` entry, at 800x600.

- [ ] **Step 1: Write `scripts/generate-scenes.ts`**

```ts
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
```

Add to `package.json` `scripts`: `"generate-scenes": "tsx --env-file=.env.local scripts/generate-scenes.ts"`.

- [ ] **Step 2: Write `scripts/render-scene-debug.ts`**

A verification tool: overlays each scene's authored hotspot rectangles on the generated image so they can be visually checked against the actual art before committing.

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { SCENES, SCENE_OBJECTS } from '../content/scenes'

async function main() {
  const sceneSlug = process.argv[2]
  if (!sceneSlug) {
    throw new Error('Usage: tsx scripts/render-scene-debug.ts <scene-slug>')
  }

  const scene = SCENES.find((candidate) => candidate.slug === sceneSlug)
  if (!scene) {
    throw new Error(`Unknown scene slug: ${sceneSlug}`)
  }

  const imagePath = path.join(process.cwd(), 'content', 'images', 'scenes', `${sceneSlug}.png`)
  const imageBuffer = readFileSync(imagePath)
  const metadata = await sharp(imageBuffer).metadata()
  const width = metadata.width ?? 800
  const height = metadata.height ?? 600

  const objects = SCENE_OBJECTS.filter((object) => object.sceneSlug === sceneSlug)
  const rects = objects
    .map((object) => {
      const x = (object.xPercent / 100) * width
      const y = (object.yPercent / 100) * height
      const w = (object.widthPercent / 100) * width
      const h = (object.heightPercent / 100) * height
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="red" stroke-width="4" />` +
        `<text x="${x + 4}" y="${y + 20}" fill="red" font-size="20" font-family="sans-serif">${object.vocabSlug}</text>`
      )
    })
    .join('')

  const svgOverlay = Buffer.from(`<svg width="${width}" height="${height}">${rects}</svg>`)
  const output = await sharp(imageBuffer)
    .composite([{ input: svgOverlay }])
    .png()
    .toBuffer()

  const outputPath = path.join(process.cwd(), 'content', 'images', 'scenes', `${sceneSlug}-debug.png`)
  writeFileSync(outputPath, output)
  console.log(`Wrote debug overlay to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

Add to `package.json` `scripts`: `"render-scene-debug": "tsx scripts/render-scene-debug.ts"` (no `--env-file` needed — this script makes no network calls).

- [ ] **Step 3: Generate the scene images**

Run: `npm run generate-scenes`

This calls Vertex AI (`gemini-2.5-flash-image`) using the same `gcloud auth application-default` credentials already configured for vocab-icon generation, and writes `content/images/scenes/scene-dog-cat.png`, `content/images/scenes/scene-colors-balloons.png`, and `content/images/scenes/scene-family.png` (each 800x600).

- [ ] **Step 4: Inspect `scene-family.png` and decide: one scene or two**

Read `content/images/scenes/scene-family.png` (via the Read tool, which renders images) and judge whether all 7 figures (mom, dad, teacher, older brother, younger brother, older sister, younger sister) are clearly distinguishable from one another — different enough in size/clothing/position that a small child could point to "the older sister" vs. "the younger sister" unambiguously.

- If clear: keep the single `scene-family` entry in `SCENES` as-is, and continue to Step 5 using that one scene.
- If not clear (e.g. two children look identical, a figure is hidden): edit `content/scenes.ts` to replace the `scene-family` entry with two entries —

```ts
  {
    slug: 'scene-family-home',
    levelId: 2,
    name: 'Family at Home',
    description: 'a mom, a dad, an older brother, and an older sister posing together at home',
  },
  {
    slug: 'scene-family-school',
    levelId: 2,
    name: 'At School',
    description: 'a younger brother, a younger sister, and their teacher standing together at school',
  },
```

  (in place of the single `scene-family` entry), then re-run `npm run generate-scenes` — it iterates `SCENES`, so it will now produce `scene-family-home.png` and `scene-family-school.png` instead. Delete the now-unused `content/images/scenes/scene-family.png` if it was created before this edit.

- [ ] **Step 5: Author hotspot coordinates for `scene-dog-cat`**

Read `content/images/scenes/scene-dog-cat.png`. For each of `dog`, `cat`, `big`, `small`, estimate a generous rectangle (as a percentage of the 800x600 image) that contains that concept:
- `dog` and `cat`: a rectangle around that animal's body.
- `big` and `small`: since these are descriptors of the same two animals rather than separate objects, use a rectangle around the dog's body for `big` and a rectangle around the cat's body for `small` (the big dog and small cat are the visual referents for those words in this scene).

Add 4 entries to `SCENE_OBJECTS` in `content/scenes.ts`, e.g. (replace the estimated numbers with your actual visual reading of the generated image — these illustrate the field shape, not a required exact value):

```ts
export const SCENE_OBJECTS: SceneObjectSource[] = [
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'dog', xPercent: 8, yPercent: 30, widthPercent: 38, heightPercent: 55 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'big', xPercent: 8, yPercent: 30, widthPercent: 38, heightPercent: 55 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'cat', xPercent: 55, yPercent: 50, widthPercent: 25, heightPercent: 35 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'small', xPercent: 55, yPercent: 50, widthPercent: 25, heightPercent: 35 },
]
```

- [ ] **Step 6: Author hotspot coordinates for `scene-colors-balloons`**

Read `content/images/scenes/scene-colors-balloons.png`. For each of the 8 color slugs (`color-red`, `color-orange`, `color-yellow`, `color-green`, `color-blue`, `color-purple`, `color-black`, `color-white`), estimate a rectangle around that balloon and append 8 entries to `SCENE_OBJECTS`.

- [ ] **Step 7: Author hotspot coordinates for the Level 2 scene(s)**

For whichever outcome Step 4 produced, read the resulting image(s) and append one `SCENE_OBJECTS` entry per depicted person (7 entries total across however many scenes exist for level 2), using each person's `sceneSlug` to match the scene they actually appear in.

- [ ] **Step 8: Verify every hotspot visually with the debug overlay script**

Run, for each scene slug that now exists in `SCENES` (e.g. `scene-dog-cat`, `scene-colors-balloons`, and `scene-family` or `scene-family-home`/`scene-family-school`):

```bash
npm run render-scene-debug -- scene-dog-cat
npm run render-scene-debug -- scene-colors-balloons
npm run render-scene-debug -- scene-family   # or scene-family-home / scene-family-school
```

Read each resulting `<slug>-debug.png` file. Confirm every labeled red rectangle visibly contains the entity it names and does not substantially overlap a different entity's silhouette. If a box is off, adjust the corresponding `SCENE_OBJECTS` entry's percentages in `content/scenes.ts` and re-run the debug script until every box looks correct. Delete the `*-debug.png` files when done — they are a verification aid, not shipped content (do not commit them).

- [ ] **Step 9: Write the failing coverage-completeness tests**

Append to `content/scenes.test.ts`:

```ts
describe('scene content coverage', () => {
  it('covers exactly dog, cat, big, and small for the dog-cat scene', () => {
    const slugs = SCENE_OBJECTS.filter((object) => object.sceneSlug === 'scene-dog-cat').map((object) => object.vocabSlug)
    expect(new Set(slugs)).toEqual(new Set(['dog', 'cat', 'big', 'small']))
  })

  it('covers exactly the 8 color words for the balloons scene', () => {
    const slugs = SCENE_OBJECTS.filter((object) => object.sceneSlug === 'scene-colors-balloons').map(
      (object) => object.vocabSlug
    )
    expect(new Set(slugs)).toEqual(
      new Set([
        'color-red',
        'color-orange',
        'color-yellow',
        'color-green',
        'color-blue',
        'color-purple',
        'color-black',
        'color-white',
      ])
    )
  })

  it('covers exactly the 7 findable people/family words across level 2 scenes, excluding pronouns', () => {
    const level2SceneSlugs = new Set(SCENES.filter((scene) => scene.levelId === 2).map((scene) => scene.slug))
    const slugs = SCENE_OBJECTS.filter((object) => level2SceneSlugs.has(object.sceneSlug)).map(
      (object) => object.vocabSlug
    )
    expect(new Set(slugs)).toEqual(
      new Set(['teacher', 'mom', 'dad', 'older-brother', 'younger-brother', 'older-sister', 'younger-sister'])
    )
    expect(slugs).not.toContain('i-me')
    expect(slugs).not.toContain('you')
  })

  it('keeps every hotspot rectangle within the 0-100 percent image bounds', () => {
    for (const object of SCENE_OBJECTS) {
      expect(object.xPercent).toBeGreaterThanOrEqual(0)
      expect(object.yPercent).toBeGreaterThanOrEqual(0)
      expect(object.xPercent + object.widthPercent).toBeLessThanOrEqual(100)
      expect(object.yPercent + object.heightPercent).toBeLessThanOrEqual(100)
    }
  })
})

describe('scene images', () => {
  it('has a matching PNG image file for every scene', () => {
    for (const scene of SCENES) {
      const imagePath = path.resolve(import.meta.dirname, 'images', 'scenes', `${scene.slug}.png`)
      expect(existsSync(imagePath)).toBe(true)
    }
  })
})
```

Add the needed imports at the top of `content/scenes.test.ts` (alongside the existing `import { describe, it, expect } from 'vitest'`):

```ts
import { existsSync } from 'node:fs'
import path from 'node:path'
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test -- content/scenes`
Expected: PASS. If any coverage or bounds test fails, fix the corresponding `SCENE_OBJECTS` entries (missing item, typo'd slug, or out-of-bounds rectangle) and re-run.

- [ ] **Step 11: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 12: Commit**

```bash
git add scripts/generate-scenes.ts scripts/render-scene-debug.ts content/scenes.ts content/scenes.test.ts content/images/scenes/*.png package.json
git commit -m "feat: generate scene art and author find-in-scene tap-region hotspots"
```

---

### Task 4: Scene database access layer and content sync

**Files:**
- Create: `src/lib/db/scenes.ts`
- Test: `src/lib/db/scenes.test.ts`
- Create: `scripts/sync-scenes.ts`

**Interfaces:**
- Consumes: `SCENES`, `SCENE_OBJECTS` from `content/scenes.ts` (Task 2/3), `uploadAsset` from `src/lib/content/storage.ts`, `createSupabaseServerClient` from `src/lib/supabase/client.ts`.
- Produces: `upsertScene(supabase, scene: SceneInput): Promise<{ id: number }>`, `upsertSceneObject(supabase, sceneObject: SceneObjectInput): Promise<void>`, `getScenesForLevel(supabase, levelId: number): Promise<SceneGameData[]>` where `SceneGameData = { id: number, imageUrl: string, objects: SceneObjectGameItem[] }` and `SceneObjectGameItem = { id: string, slug: string, audioUrl: string, xPercent: number, yPercent: number, widthPercent: number, heightPercent: number }` — consumed by Task 5 (`SceneGame` component props) and Task 6 (the new route's server component).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/db/scenes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertScene, upsertSceneObject, getScenesForLevel } from './scenes'

function makeUpsertMock(overrides: {
  upsertResult?: { error: unknown }
  singleResult?: { data: unknown; error: unknown }
}) {
  const single = vi.fn().mockResolvedValue(overrides.singleResult ?? { data: null, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const upsert = vi.fn().mockReturnValue({
    select,
    then: (resolve: (value: { error: unknown }) => void) => resolve(overrides.upsertResult ?? { error: null }),
  })
  const from = vi.fn().mockReturnValue({ upsert })
  return { from } as unknown as SupabaseClient
}

describe('upsertScene', () => {
  it('returns the upserted scene id', async () => {
    const supabase = makeUpsertMock({ singleResult: { data: { id: 1 }, error: null } })
    const result = await upsertScene(supabase, {
      slug: 'scene-dog-cat',
      levelId: 3,
      name: 'Dog and Cat',
      imageUrl: 'https://example.com/scene-dog-cat.png',
    })
    expect(result).toEqual({ id: 1 })
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeUpsertMock({ singleResult: { data: null, error: { message: 'boom' } } })
    await expect(
      upsertScene(supabase, {
        slug: 'scene-dog-cat',
        levelId: 3,
        name: 'Dog and Cat',
        imageUrl: 'https://example.com/scene-dog-cat.png',
      })
    ).rejects.toThrow('Failed to upsert scene scene-dog-cat: boom')
  })
})

describe('upsertSceneObject', () => {
  it('resolves when the upsert succeeds', async () => {
    const supabase = makeUpsertMock({ upsertResult: { error: null } })
    await expect(
      upsertSceneObject(supabase, {
        sceneId: 1,
        vocabItemId: 'v1',
        xPercent: 10,
        yPercent: 10,
        widthPercent: 20,
        heightPercent: 20,
      })
    ).resolves.toBeUndefined()
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeUpsertMock({ upsertResult: { error: { message: 'boom' } } })
    await expect(
      upsertSceneObject(supabase, {
        sceneId: 1,
        vocabItemId: 'v1',
        xPercent: 10,
        yPercent: 10,
        widthPercent: 20,
        heightPercent: 20,
      })
    ).rejects.toThrow('Failed to upsert scene object for scene 1: boom')
  })
})

function makeScenesQueryMock(overrides: {
  scenesResult?: { data: unknown; error: unknown }
  objectsResult?: { data: unknown; error: unknown }
}) {
  const scenesOrder = vi.fn().mockResolvedValue(overrides.scenesResult ?? { data: [], error: null })
  const scenesEq = vi.fn().mockReturnValue({ order: scenesOrder })
  const scenesSelect = vi.fn().mockReturnValue({ eq: scenesEq })

  const objectsOrder = vi.fn().mockResolvedValue(overrides.objectsResult ?? { data: [], error: null })
  const objectsEq = vi.fn().mockReturnValue({ order: objectsOrder })
  const objectsSelect = vi.fn().mockReturnValue({ eq: objectsEq })

  const from = vi.fn((table: string) => {
    if (table === 'scenes') return { select: scenesSelect }
    if (table === 'scene_objects') return { select: objectsSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from } as unknown as SupabaseClient
}

describe('getScenesForLevel', () => {
  it('returns scenes with their objects mapped to camelCase', async () => {
    const supabase = makeScenesQueryMock({
      scenesResult: { data: [{ id: 1, image_url: 'https://example.com/scene-1.png' }], error: null },
      objectsResult: {
        data: [
          {
            x_percent: 10,
            y_percent: 10,
            width_percent: 20,
            height_percent: 20,
            vocab_items: { id: 'v1', slug: 'dog', audio_url: 'https://example.com/dog.mp3' },
          },
        ],
        error: null,
      },
    })

    const result = await getScenesForLevel(supabase, 3)
    expect(result).toEqual([
      {
        id: 1,
        imageUrl: 'https://example.com/scene-1.png',
        objects: [
          {
            id: 'v1',
            slug: 'dog',
            audioUrl: 'https://example.com/dog.mp3',
            xPercent: 10,
            yPercent: 10,
            widthPercent: 20,
            heightPercent: 20,
          },
        ],
      },
    ])
  })

  it('returns an empty array when the level has no scenes', async () => {
    const supabase = makeScenesQueryMock({ scenesResult: { data: [], error: null } })
    const result = await getScenesForLevel(supabase, 1)
    expect(result).toEqual([])
  })

  it('throws when the scenes query errors', async () => {
    const supabase = makeScenesQueryMock({ scenesResult: { data: null, error: { message: 'boom' } } })
    await expect(getScenesForLevel(supabase, 3)).rejects.toThrow('Failed to fetch scenes for level 3: boom')
  })

  it('throws when the scene_objects query errors', async () => {
    const supabase = makeScenesQueryMock({
      scenesResult: { data: [{ id: 1, image_url: 'https://example.com/scene-1.png' }], error: null },
      objectsResult: { data: null, error: { message: 'boom' } },
    })
    await expect(getScenesForLevel(supabase, 3)).rejects.toThrow('Failed to fetch scene objects for scene 1: boom')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/db/scenes`
Expected: FAIL with a module-not-found error — `src/lib/db/scenes.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/db/scenes.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SceneInput {
  slug: string
  levelId: number
  name: string
  imageUrl: string
}

export async function upsertScene(supabase: SupabaseClient, scene: SceneInput): Promise<{ id: number }> {
  const { data, error } = await supabase
    .from('scenes')
    .upsert(
      { slug: scene.slug, level_id: scene.levelId, name: scene.name, image_url: scene.imageUrl },
      { onConflict: 'slug' }
    )
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to upsert scene ${scene.slug}: ${error?.message ?? 'unknown error'}`)
  }
  return data as { id: number }
}

export interface SceneObjectInput {
  sceneId: number
  vocabItemId: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export async function upsertSceneObject(supabase: SupabaseClient, sceneObject: SceneObjectInput): Promise<void> {
  const { error } = await supabase.from('scene_objects').upsert(
    {
      scene_id: sceneObject.sceneId,
      vocab_item_id: sceneObject.vocabItemId,
      x_percent: sceneObject.xPercent,
      y_percent: sceneObject.yPercent,
      width_percent: sceneObject.widthPercent,
      height_percent: sceneObject.heightPercent,
    },
    { onConflict: 'scene_id,vocab_item_id' }
  )

  if (error) {
    throw new Error(`Failed to upsert scene object for scene ${sceneObject.sceneId}: ${error.message}`)
  }
}

export interface SceneObjectGameItem {
  id: string
  slug: string
  audioUrl: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export interface SceneGameData {
  id: number
  imageUrl: string
  objects: SceneObjectGameItem[]
}

interface SceneObjectRow {
  x_percent: number
  y_percent: number
  width_percent: number
  height_percent: number
  vocab_items: { id: string; slug: string; audio_url: string }
}

export async function getScenesForLevel(supabase: SupabaseClient, levelId: number): Promise<SceneGameData[]> {
  const { data: scenes, error: scenesError } = await supabase
    .from('scenes')
    .select('id, image_url')
    .eq('level_id', levelId)
    .order('created_at', { ascending: true })

  if (scenesError) {
    throw new Error(`Failed to fetch scenes for level ${levelId}: ${scenesError.message}`)
  }

  const result: SceneGameData[] = []
  for (const scene of (scenes ?? []) as Array<{ id: number; image_url: string }>) {
    const { data: objects, error: objectsError } = await supabase
      .from('scene_objects')
      .select('x_percent, y_percent, width_percent, height_percent, vocab_items(id, slug, audio_url)')
      .eq('scene_id', scene.id)
      .order('created_at', { ascending: true })

    if (objectsError) {
      throw new Error(`Failed to fetch scene objects for scene ${scene.id}: ${objectsError.message}`)
    }

    result.push({
      id: scene.id,
      imageUrl: scene.image_url,
      objects: ((objects ?? []) as unknown as SceneObjectRow[]).map((row) => ({
        id: row.vocab_items.id,
        slug: row.vocab_items.slug,
        audioUrl: row.vocab_items.audio_url,
        xPercent: row.x_percent,
        yPercent: row.y_percent,
        widthPercent: row.width_percent,
        heightPercent: row.height_percent,
      })),
    })
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/db/scenes`
Expected: PASS

- [ ] **Step 5: Write `scripts/sync-scenes.ts`**

This uploads generated scene images and syncs scene/scene_objects rows to Supabase. It must run **after** `npm run sync-content` (it looks up vocab item ids by slug, which requires vocab items to already exist).

```ts
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

  for (const scene of SCENES) {
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

  console.log(`Done. Synced ${SCENES.length} scenes.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

Add to `package.json` `scripts`: `"sync-scenes": "tsx --env-file=.env.local scripts/sync-scenes.ts"`.

- [ ] **Step 6: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean. (`sync-scenes.ts` itself has no unit test — it is a thin orchestration script over already-tested `upsertScene`/`upsertSceneObject`/`uploadAsset`, matching the existing untested `sync-content.ts`/`generate-images.ts` precedent in this codebase.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/scenes.ts src/lib/db/scenes.test.ts scripts/sync-scenes.ts package.json
git commit -m "feat: add scene database access layer and content sync script"
```

---

### Task 5: Scene tap hit-testing and the SceneGame client component

**Files:**
- Create: `src/lib/game/scene-hit-test.ts`
- Test: `src/lib/game/scene-hit-test.test.ts`
- Create: `src/app/play/[levelId]/scene/scene-game.tsx`
- Test: `src/app/play/[levelId]/scene/scene-game.test.tsx`

**Interfaces:**
- Consumes: `SceneGameData`, `SceneObjectGameItem` types from `src/lib/db/scenes.ts` (Task 4).
- Produces: `isPointInHotspot(xPercent: number, yPercent: number, hotspot: Hotspot): boolean` where `Hotspot = { xPercent: number, yPercent: number, widthPercent: number, heightPercent: number }`. `SceneGame({ levelId, levelName, scenes }: { levelId: number, levelName: string, scenes: SceneGameData[] }): JSX.Element` — consumed by Task 6's route page.

- [ ] **Step 1: Write the failing tests for hit testing**

Create `src/lib/game/scene-hit-test.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPointInHotspot } from './scene-hit-test'

const HOTSPOT = { xPercent: 20, yPercent: 20, widthPercent: 30, heightPercent: 30 }

describe('isPointInHotspot', () => {
  it('returns true for a point inside the hotspot', () => {
    expect(isPointInHotspot(35, 35, HOTSPOT)).toBe(true)
  })

  it('returns true for a point within the padding just outside the hotspot edge', () => {
    // hotspot right edge is at 50; padding extends the hit area to 55
    expect(isPointInHotspot(52, 35, HOTSPOT)).toBe(true)
  })

  it('returns false for a point beyond the padding', () => {
    expect(isPointInHotspot(60, 35, HOTSPOT)).toBe(false)
  })

  it('returns false for a point far outside the hotspot', () => {
    expect(isPointInHotspot(90, 90, HOTSPOT)).toBe(false)
  })

  it('clamps padding at the image edges', () => {
    const edgeHotspot = { xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }
    expect(isPointInHotspot(-3, 5, edgeHotspot)).toBe(false)
    expect(isPointInHotspot(0, 5, edgeHotspot)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scene-hit-test`
Expected: FAIL with a module-not-found error — `src/lib/game/scene-hit-test.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/game/scene-hit-test.ts`**

```ts
export interface Hotspot {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// Kids tap imprecisely, so every authored hotspot is treated as larger than
// its stored rectangle by this many percentage points on each side.
const TAP_PADDING_PERCENT = 5

export function isPointInHotspot(xPercent: number, yPercent: number, hotspot: Hotspot): boolean {
  const left = Math.max(0, hotspot.xPercent - TAP_PADDING_PERCENT)
  const right = Math.min(100, hotspot.xPercent + hotspot.widthPercent + TAP_PADDING_PERCENT)
  const top = Math.max(0, hotspot.yPercent - TAP_PADDING_PERCENT)
  const bottom = Math.min(100, hotspot.yPercent + hotspot.heightPercent + TAP_PADDING_PERCENT)

  return xPercent >= left && xPercent <= right && yPercent >= top && yPercent <= bottom
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scene-hit-test`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `SceneGame`**

Create `src/app/play/[levelId]/scene/scene-game.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SceneGameData } from '@/lib/db/scenes'
import { SceneGame } from './scene-game'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function makeScene(id: number, objects: SceneGameData['objects']): SceneGameData {
  return { id, imageUrl: `https://example.com/scene-${id}.png`, objects }
}

const DOG = {
  id: 'dog',
  slug: 'dog',
  audioUrl: 'https://example.com/dog.mp3',
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 20,
}
const CAT = {
  id: 'cat',
  slug: 'cat',
  audioUrl: 'https://example.com/cat.mp3',
  xPercent: 60,
  yPercent: 60,
  widthPercent: 20,
  heightPercent: 20,
}

describe('SceneGame', () => {
  beforeEach(() => {
    pushMock.mockClear()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    })) as unknown as () => DOMRect
  })

  it('advances to the next question after tapping inside the target hotspot', async () => {
    const scenes = [makeScene(1, [DOG, CAT])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeInTheDocument())
  })

  it('shows a retry message when tapping outside the target hotspot', async () => {
    const scenes = [makeScene(1, [DOG, CAT])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 180, clientY: 180 })

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again!')
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
  })

  it('finishes a single-object level with 3 stars for a first-try correct tap', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(screen.getByText('Level complete!')).toBeInTheDocument())
    expect(screen.getByText('You earned 3 stars.')).toBeInTheDocument()
  })

  it('awards 1 star after a retry', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 180, clientY: 180 })
    await screen.findByRole('alert')
    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(screen.getByText('You earned 1 stars.')).toBeInTheDocument())
  })

  it('advances through multiple scenes in sequence', async () => {
    const scenes = [makeScene(1, [DOG]), makeScene(2, [CAT])]
    render(<SceneGame levelId={2} levelName="People & Family" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() =>
      expect(screen.getByTestId('scene-image')).toHaveAttribute('src', 'https://example.com/scene-2.png')
    )
    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 140, clientY: 140 })

    await waitFor(() => expect(screen.getByText('Level complete!')).toBeInTheDocument())
  })

  it('saves progress via the API with gameType find-scene', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/progress',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ levelId: 3, starsEarned: 3, gameType: 'find-scene' }),
        })
      )
    )
  })

  it('returns to the level list when "Back to levels" is clicked', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })
    await screen.findByText('Level complete!')

    fireEvent.click(screen.getByRole('button', { name: 'Back to levels' }))
    expect(pushMock).toHaveBeenCalledWith('/play')
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- scene-game`
Expected: FAIL with a module-not-found error — `src/app/play/[levelId]/scene/scene-game.tsx` does not exist yet.

- [ ] **Step 7: Implement `src/app/play/[levelId]/scene/scene-game.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isPointInHotspot } from '@/lib/game/scene-hit-test'
import type { SceneGameData } from '@/lib/db/scenes'

const STARS_FIRST_TRY = 3
const STARS_AFTER_RETRY = 1

interface SceneGameProps {
  levelId: number
  levelName: string
  scenes: SceneGameData[]
}

interface Question {
  sceneIndex: number
  objectIndex: number
}

export function SceneGame({ levelId, levelName, scenes }: SceneGameProps) {
  const router = useRouter()

  // Fixed insertion order across scenes and their objects — no
  // randomization, so there is no risk of the hydration mismatch that a
  // seeded/unseeded Math.random() call caused in ListenTapGame.
  const questions = useMemo(() => {
    const list: Question[] = []
    scenes.forEach((scene, sceneIndex) => {
      scene.objects.forEach((_, objectIndex) => {
        list.push({ sceneIndex, objectIndex })
      })
    })
    return list
  }, [scenes])

  const [questionIndex, setQuestionIndex] = useState(0)
  const [starsEarned, setStarsEarned] = useState(0)
  const [hasMissed, setHasMissed] = useState(false)
  const [phase, setPhase] = useState<'playing' | 'saving' | 'summary'>('playing')
  const audioRef = useRef<HTMLAudioElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const currentQuestion = questions[questionIndex]
  const currentScene = currentQuestion ? scenes[currentQuestion.sceneIndex] : undefined
  const currentObject = currentQuestion ? currentScene?.objects[currentQuestion.objectIndex] : undefined

  const [lastObjectId, setLastObjectId] = useState(currentObject?.id)
  if (currentObject?.id !== lastObjectId) {
    setLastObjectId(currentObject?.id)
    setHasMissed(false)
  }

  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [currentObject])

  async function finishLevel(finalStars: number) {
    setPhase('saving')
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'find-scene' }),
    })
    setPhase('summary')
  }

  function handleImageClick(event: React.MouseEvent<HTMLImageElement>) {
    if (!currentObject || phase !== 'playing') return

    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return

    const xPercent = ((event.clientX - rect.left) / rect.width) * 100
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100

    if (!isPointInHotspot(xPercent, yPercent, currentObject)) {
      setHasMissed(true)
      return
    }

    const earned = hasMissed ? STARS_AFTER_RETRY : STARS_FIRST_TRY
    const newStars = starsEarned + earned
    const isLastQuestion = questionIndex + 1 >= questions.length

    setStarsEarned(newStars)

    if (isLastQuestion) {
      finishLevel(newStars)
      return
    }

    setQuestionIndex((value) => value + 1)
  }

  if (phase === 'summary') {
    return (
      <main>
        <h1>Level complete!</h1>
        <p>You earned {starsEarned} stars.</p>
        <button onClick={() => router.push('/play')}>Back to levels</button>
      </main>
    )
  }

  if (!currentQuestion || !currentScene || !currentObject) {
    return <p>Loading...</p>
  }

  return (
    <main>
      <h1>{levelName}</h1>
      <p>
        Question {questionIndex + 1} of {questions.length}
      </p>
      <audio ref={audioRef} src={currentObject.audioUrl} data-testid="prompt-audio" />
      <button onClick={() => audioRef.current?.play().catch(() => {})}>Play again</button>
      {/* eslint-disable-next-line @next/next/no-img-element -- tapped directly by pixel coordinate, not a Next/Image optimization candidate */}
      <img
        ref={imageRef}
        src={currentScene.imageUrl}
        alt=""
        data-testid="scene-image"
        onClick={handleImageClick}
        style={{ cursor: 'pointer', maxWidth: '100%' }}
      />
      {hasMissed && <p role="alert">Try again!</p>}
    </main>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- scene-game scene-hit-test`
Expected: PASS

- [ ] **Step 9: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game/scene-hit-test.ts src/lib/game/scene-hit-test.test.ts src/app/play/\[levelId\]/scene/scene-game.tsx src/app/play/\[levelId\]/scene/scene-game.test.tsx
git commit -m "feat: add scene tap hit-testing and the SceneGame client component"
```

---

### Task 6: Scene route and level-select integration

**Files:**
- Create: `src/app/play/[levelId]/scene/page.tsx`
- Test: `src/app/play/[levelId]/scene/page.test.tsx`
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.tsx`

**Interfaces:**
- Consumes: `getScenesForLevel` from `src/lib/db/scenes.ts` (Task 4), `SceneGame` from `./scene-game` (Task 5), `SCENES` from `content/scenes.ts` (Task 2/3), `readSessionFromCookieValue`/`COOKIE_NAME` from `src/lib/auth/session.ts`, `createSupabaseServerClient`, `getProgressForKid`, `computeLevelStatus`, `LEVELS` — same as the existing `src/app/play/[levelId]/page.tsx` and `src/app/play/page.tsx`.
- Produces: route `/play/[levelId]/scene`.

- [ ] **Step 1: Write the failing test for the new route**

Create `src/app/play/[levelId]/scene/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn()
const notFoundMock = vi.fn()
const getMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url)
    throw new Error(`REDIRECT:${url}`)
  },
  notFound: () => {
    notFoundMock()
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/progress', () => ({
  getProgressForKid: vi.fn(),
}))
vi.mock('@/lib/db/scenes', () => ({
  getScenesForLevel: vi.fn(),
}))
vi.mock('./scene-game', () => ({
  SceneGame: ({ levelName }: { levelName: string }) => <div>Playing scene: {levelName}</div>,
}))

import ScenePage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { getScenesForLevel } from '@/lib/db/scenes'
import { createSessionCookieValue } from '@/lib/auth/session'

function makeParams(levelId: string) {
  return Promise.resolve({ levelId })
}

describe('ScenePage', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    notFoundMock.mockClear()
  })

  it('calls notFound for an unknown level id', async () => {
    await expect(ScenePage({ params: makeParams('999') })).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('redirects to login when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    await expect(ScenePage({ params: makeParams('3') })).rejects.toThrow('REDIRECT:/login')
  })

  it('redirects to /play when the level is locked', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('3') })).rejects.toThrow('REDIRECT:/play')
  })

  it('calls notFound when the unlocked level has no scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getScenesForLevel).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('1') })).rejects.toThrow('NOT_FOUND')
  })

  it('renders the scene game when the level is unlocked and has scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getScenesForLevel).mockResolvedValue([{ id: 1, imageUrl: 'https://example.com/s.png', objects: [] }])

    render(await ScenePage({ params: makeParams('1') }))
    expect(screen.getByText('Playing scene: Greetings')).toBeInTheDocument()
  })
})
```

Note: level 1 ("Greetings") is unlocked from a fresh empty-progress state (its `unlockThreshold` is 0), which is why it's used for the "renders when unlocked" and "notFound when no scenes" cases above — the mocked `getScenesForLevel` controls whether scenes exist, independent of level content in `content/scenes.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "play/\[levelId\]/scene/page"`
Expected: FAIL with a module-not-found error — `src/app/play/[levelId]/scene/page.tsx` does not exist yet.

- [ ] **Step 3: Implement `src/app/play/[levelId]/scene/page.tsx`**

```tsx
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { getScenesForLevel } from '@/lib/db/scenes'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../../content/vocab'
import { SceneGame } from './scene-game'

export default async function ScenePage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId: levelIdParam } = await params
  const levelId = Number(levelIdParam)

  const level = LEVELS.find((candidate) => candidate.id === levelId)
  if (!level) {
    notFound()
  }

  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)
  if (!session) {
    redirect('/login')
  }

  const supabase = createSupabaseServerClient()
  const progress = await getProgressForKid(supabase, session.kidId)
  const statuses = computeLevelStatus(LEVELS, progress)
  const status = statuses.find((candidate) => candidate.id === levelId)

  if (!status?.unlocked) {
    redirect('/play')
  }

  const scenes = await getScenesForLevel(supabase, levelId)
  if (scenes.length === 0) {
    notFound()
  }

  return <SceneGame levelId={levelId} levelName={level.name} scenes={scenes} />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "play/\[levelId\]/scene/page"`
Expected: PASS

- [ ] **Step 5: Update the level-select page to link to the scene game**

Read the current `src/app/play/page.tsx` and replace its full contents with:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { SCENES } from '../../../content/scenes'

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

export default async function PlayPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)

  if (!session) {
    redirect('/login')
  }

  const supabase = createSupabaseServerClient()
  const progress = await getProgressForKid(supabase, session.kidId)
  const levels = computeLevelStatus(LEVELS, progress)

  return (
    <main>
      <h1>Choose a level</h1>
      <ul>
        {levels.map((level) => (
          <li key={level.id}>
            {level.unlocked ? (
              <>
                {level.name} — {level.starsEarned} stars{' '}
                <Link href={`/play/${level.id}`}>Listen &amp; Tap</Link>
                {LEVEL_IDS_WITH_SCENES.has(level.id) && (
                  <>
                    {' '}
                    · <Link href={`/play/${level.id}/scene`}>Find in the Scene</Link>
                  </>
                )}
              </>
            ) : (
              <span>{level.name} — locked</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 6: Update the level-select test to match the new markup**

Read the current `src/app/play/page.test.tsx` and replace its `'shows unlocked levels as links and locked levels as plain text'` test with:

```tsx
  it('shows unlocked levels with a Listen & Tap link and locked levels as plain text', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    expect(screen.getByText(/Greetings — 10 stars/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute('href', '/play/1')
    expect(screen.getByText(/People & Family — locked/)).toBeInTheDocument()
  })

  it('shows a Find in the Scene link only for unlocked levels that have scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 200, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    // Level 1 (Greetings) has no scene content, so no scene link even though unlocked.
    expect(screen.queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- play/page`
Expected: PASS

- [ ] **Step 8: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 9: Build check**

Run: `npm run build`
Expected: Build succeeds with no type errors (the new dynamic route `/play/[levelId]/scene` compiles alongside the existing `/play/[levelId]` route).

- [ ] **Step 10: Commit**

```bash
git add src/app/play/\[levelId\]/scene/page.tsx src/app/play/\[levelId\]/scene/page.test.tsx src/app/play/page.tsx src/app/play/page.test.tsx
git commit -m "feat: add find-in-scene route and link it from the level-select page"
```

---

## Post-implementation: sync to production Supabase

Not a plan task (it's a manual/controller step, like the equivalent step in the Art Pipeline plan) — after all 6 tasks are merged:

1. Run `npm run sync-content` first (idempotent — re-syncs vocab items/levels; scene sync depends on vocab items already existing by slug).
2. Run `npm run sync-scenes` to upload scene images and populate `scenes`/`scene_objects` in production.
3. Run the `0004_create_scenes.sql` migration against the live Supabase database via the SQL Editor (same process used for the `0003_create_progress.sql` migration).
4. Live-verify via `claude-in-chrome`: log in as an existing kid with enough stars to unlock Levels 2/3/5, visit `/play`, confirm "Find in the Scene" links appear for those three levels only, play through the Level 3 scene (`dog`/`cat`/`big`/`small`), confirm correct taps advance and award stars, confirm an incorrect tap shows "Try again!", confirm stars save and show up back on `/play`.

---

## Self-Review

**Spec coverage:**
- `scenes`/`scene_objects` schema with percentage-based hotspots → Task 2.
- Reuse of `image-gen.ts`/`image-resize.ts` with a scene-appropriate style/aspect ratio → Task 1.
- Three scenes (dog/cat, colors/balloons, family) with the specified descriptions, Level 2's one-vs-two-scene fallback → Task 3.
- Hand-authored hotspots via visual inspection, with an objective verification aid (`render-scene-debug.ts`) → Task 3.
- New `find-scene` game type, new route, reusing session/progress patterns from `ListenTapGame` → Tasks 4-6.
- Same star scoring via the existing generic `POST /api/progress` → Task 5 (verified via test asserting `gameType: 'find-scene'`), confirmed no API changes needed.
- Level-select page shows the new game type only for levels 2/3/5 → Task 6.
- Fixed order / no `Math.random()` hydration risk → Task 5 (`questions` built by plain array iteration, no RNG at all).

**Placeholder scan:** no "TBD"/"handle it"/"similar to Task N" language. The one place values are not pinned to exact numbers ahead of time — `SCENE_OBJECTS` hotspot coordinates — has a fully specified procedure (generate → read the image → estimate percentages → verify with the overlay script → adjust) and testable acceptance criteria (coverage-completeness and bounds tests), which is the closest an empirically-derived raster annotation can get to "no placeholders" without fabricating numbers that don't correspond to a real image.

**Type consistency:** `SceneGameData`/`SceneObjectGameItem` (Task 4) match the props consumed by `SceneGame` (Task 5) and constructed by `getScenesForLevel` (Task 4) and `page.tsx` (Task 6). `Hotspot` (Task 5) structurally matches `SceneObjectGameItem` (both have `xPercent`/`yPercent`/`widthPercent`/`heightPercent`), so `isPointInHotspot(x, y, currentObject)` type-checks without adapting. `SceneSource`/`SceneObjectSource` (Task 2) field names (`sceneSlug`, `vocabSlug`, `xPercent`, etc.) match their usage in Task 3's authored data and Task 4's `sync-scenes.ts`.
