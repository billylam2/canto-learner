# Content Pipeline & Vocabulary Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the starter 31-word Cantonese vocabulary (with real audio and illustrations) into Supabase, driven by a committed, version-controlled content source and a repeatable sync script.

**Architecture:** Vocabulary content lives as typed source data (`content/vocab.ts`) and hand-authored SVG illustrations (`content/images/`) committed to the repo. A manually-run Node script (`scripts/sync-content.ts`) reads that source, synthesizes Cantonese audio per word via Google Cloud Text-to-Speech, uploads audio and images to public Supabase Storage buckets, and upserts `levels`/`vocab_items`/`level_vocab` rows in Postgres. A filesystem-only Vitest check (no live services, runs in CI) guards against content drift — every vocab entry must have real text and a matching image file.

**Tech Stack:** TypeScript, `@google-cloud/text-to-speech`, `@supabase/supabase-js` (already a dependency), `tsx` (to run the script), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-cantonese-kids-app-design.md`

## Global Constraints

- Vocabulary source of truth is `content/vocab.ts`; the database is always derived from it via the sync script, never hand-edited.
- Cantonese text uses Traditional Chinese characters with Jyutping romanization, matching the spec's data model (`cantonese_text`, `jyutping`, `english_gloss` fields).
- Kids never see English gloss, Jyutping, or Chinese characters as the "answer" in-app — those fields are for content management only, per the spec's non-goal on literacy.
- `vocab_items`, `levels`, and `level_vocab` tables get Row Level Security enabled with **no** policies (service-role-only access), matching the `kids` table pattern from the Foundation & Auth plan — the browser never queries Postgres directly for content.
- The two Storage buckets (`vocab-audio`, `vocab-images`) are public-read, since the browser fetches audio/image assets directly from Supabase Storage CDN URLs rather than through the Next.js API, per the spec's architecture.
- Any vocabulary items that are Cantonese homophones of each other must share a `homophoneGroup` (source) / `homophone_group` (database) value, so future game logic can avoid ever offering both as answer choices in the same round.
- The content-integrity test must not require live network/service credentials, so it runs in CI without secrets.
- The sync script itself is not covered by automated tests (it is a thin orchestration entrypoint); all real logic it calls lives in separately tested helper functions.

---

## Task 1: Vocabulary Source Data

**Files:**
- Create: `content/vocab.ts`
- Test: `content/vocab.test.ts`

**Interfaces:**
- Produces: `VocabCategory` type, `VocabSourceItem` interface (`{ slug: string; category: VocabCategory; level: number; cantonese: string; jyutping: string; englishGloss: string; homophoneGroup?: string }`), `LevelSource` interface (`{ id: number; name: string; order: number; unlockThreshold: number }`), `LEVELS: LevelSource[]`, `VOCAB_ITEMS: VocabSourceItem[]` — consumed by Tasks 2, 4, 6, and 7.

- [ ] **Step 1: Write the failing tests**

Create `content/vocab.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LEVELS, VOCAB_ITEMS } from './vocab'

describe('vocab content', () => {
  it('has exactly 31 items', () => {
    expect(VOCAB_ITEMS.length).toBe(31)
  })

  it('has a unique slug for every item', () => {
    const slugs = VOCAB_ITEMS.map((item) => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has non-empty Cantonese text, jyutping, and English gloss for every item', () => {
    for (const item of VOCAB_ITEMS) {
      expect(item.cantonese.length).toBeGreaterThan(0)
      expect(item.jyutping.length).toBeGreaterThan(0)
      expect(item.englishGloss.length).toBeGreaterThan(0)
    }
  })

  it('references only levels that exist', () => {
    const levelIds = new Set(LEVELS.map((level) => level.id))
    for (const item of VOCAB_ITEMS) {
      expect(levelIds.has(item.level)).toBe(true)
    }
  })

  it('flags dog and nine as a homophone pair', () => {
    const dog = VOCAB_ITEMS.find((item) => item.slug === 'dog')
    const nine = VOCAB_ITEMS.find((item) => item.slug === 'number-9')
    expect(dog?.homophoneGroup).toBe('gau2')
    expect(nine?.homophoneGroup).toBe('gau2')
  })

  it('has 4 levels in ascending order', () => {
    expect(LEVELS.map((level) => level.order)).toEqual([1, 2, 3, 4])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- vocab.test.ts`
Expected: FAIL — `./vocab` does not exist.

- [ ] **Step 3: Implement `content/vocab.ts`**

```ts
export type VocabCategory = 'greetings' | 'people' | 'family' | 'descriptors' | 'animals' | 'numbers'

export interface VocabSourceItem {
  slug: string
  category: VocabCategory
  level: number
  cantonese: string
  jyutping: string
  englishGloss: string
  homophoneGroup?: string
}

export interface LevelSource {
  id: number
  name: string
  order: number
  unlockThreshold: number
}

export const LEVELS: LevelSource[] = [
  { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 },
  { id: 2, name: 'People & Family', order: 2, unlockThreshold: 20 },
  { id: 3, name: 'Descriptors & Animals', order: 3, unlockThreshold: 40 },
  { id: 4, name: 'Numbers', order: 4, unlockThreshold: 60 },
]

export const VOCAB_ITEMS: VocabSourceItem[] = [
  // Level 1: Greetings
  { slug: 'hello', category: 'greetings', level: 1, cantonese: '你好', jyutping: 'nei5 hou2', englishGloss: 'hello' },
  { slug: 'hello-everyone', category: 'greetings', level: 1, cantonese: '大家好', jyutping: 'daai6 gaa1 hou2', englishGloss: 'hello everyone' },
  { slug: 'good-morning', category: 'greetings', level: 1, cantonese: '早晨', jyutping: 'zou2 san4', englishGloss: 'good morning' },
  { slug: 'good-evening', category: 'greetings', level: 1, cantonese: '晚安', jyutping: 'maan5 on1', englishGloss: 'good evening' },
  { slug: 'goodbye', category: 'greetings', level: 1, cantonese: '拜拜', jyutping: 'baai1 baai3', englishGloss: 'goodbye' },
  { slug: 'thank-you', category: 'greetings', level: 1, cantonese: '唔該', jyutping: 'm4 goi1', englishGloss: 'thank you' },
  { slug: 'excuse-me', category: 'greetings', level: 1, cantonese: '唔好意思', jyutping: 'm4 hou2 ji3 si1', englishGloss: 'excuse me' },
  { slug: 'sorry', category: 'greetings', level: 1, cantonese: '對唔住', jyutping: 'deoi3 m4 zyu6', englishGloss: 'sorry' },
  // Level 2: People & Family
  { slug: 'i-me', category: 'people', level: 2, cantonese: '我', jyutping: 'ngo5', englishGloss: 'I / me' },
  { slug: 'you', category: 'people', level: 2, cantonese: '你', jyutping: 'nei5', englishGloss: 'you' },
  { slug: 'teacher', category: 'people', level: 2, cantonese: '老師', jyutping: 'lou5 si1', englishGloss: 'teacher' },
  { slug: 'mom', category: 'family', level: 2, cantonese: '媽媽', jyutping: 'maa4 maa1', englishGloss: 'mom' },
  { slug: 'dad', category: 'family', level: 2, cantonese: '爸爸', jyutping: 'baa4 baa1', englishGloss: 'dad' },
  { slug: 'older-brother', category: 'family', level: 2, cantonese: '哥哥', jyutping: 'go4 go1', englishGloss: 'older brother' },
  { slug: 'younger-brother', category: 'family', level: 2, cantonese: '弟弟', jyutping: 'dai4 dai2', englishGloss: 'younger brother' },
  { slug: 'older-sister', category: 'family', level: 2, cantonese: '姐姐', jyutping: 'ze4 ze1', englishGloss: 'older sister' },
  { slug: 'younger-sister', category: 'family', level: 2, cantonese: '妹妹', jyutping: 'mui4 mui2', englishGloss: 'younger sister' },
  // Level 3: Descriptors & Animals
  { slug: 'big', category: 'descriptors', level: 3, cantonese: '大', jyutping: 'daai6', englishGloss: 'big' },
  { slug: 'small', category: 'descriptors', level: 3, cantonese: '細', jyutping: 'sai3', englishGloss: 'small' },
  { slug: 'cat', category: 'animals', level: 3, cantonese: '貓', jyutping: 'maau1', englishGloss: 'cat' },
  { slug: 'dog', category: 'animals', level: 3, cantonese: '狗', jyutping: 'gau2', englishGloss: 'dog', homophoneGroup: 'gau2' },
  // Level 4: Numbers
  { slug: 'number-1', category: 'numbers', level: 4, cantonese: '一', jyutping: 'jat1', englishGloss: 'one' },
  { slug: 'number-2', category: 'numbers', level: 4, cantonese: '二', jyutping: 'ji6', englishGloss: 'two' },
  { slug: 'number-3', category: 'numbers', level: 4, cantonese: '三', jyutping: 'saam1', englishGloss: 'three' },
  { slug: 'number-4', category: 'numbers', level: 4, cantonese: '四', jyutping: 'sei3', englishGloss: 'four' },
  { slug: 'number-5', category: 'numbers', level: 4, cantonese: '五', jyutping: 'ng5', englishGloss: 'five' },
  { slug: 'number-6', category: 'numbers', level: 4, cantonese: '六', jyutping: 'luk6', englishGloss: 'six' },
  { slug: 'number-7', category: 'numbers', level: 4, cantonese: '七', jyutping: 'cat1', englishGloss: 'seven' },
  { slug: 'number-8', category: 'numbers', level: 4, cantonese: '八', jyutping: 'baat3', englishGloss: 'eight' },
  { slug: 'number-9', category: 'numbers', level: 4, cantonese: '九', jyutping: 'gau2', englishGloss: 'nine', homophoneGroup: 'gau2' },
  { slug: 'number-10', category: 'numbers', level: 4, cantonese: '十', jyutping: 'sap6', englishGloss: 'ten' },
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- vocab.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add content/vocab.ts content/vocab.test.ts
git commit -m "feat: add starter vocabulary source data"
```

---

## Task 2: Vocabulary Illustrations

**Files:**
- Create: `content/images/hello.svg`
- Create: `content/images/hello-everyone.svg`
- Create: `content/images/good-morning.svg`
- Create: `content/images/good-evening.svg`
- Create: `content/images/goodbye.svg`
- Create: `content/images/thank-you.svg`
- Create: `content/images/excuse-me.svg`
- Create: `content/images/sorry.svg`
- Create: `content/images/i-me.svg`
- Create: `content/images/you.svg`
- Create: `content/images/teacher.svg`
- Create: `content/images/mom.svg`
- Create: `content/images/dad.svg`
- Create: `content/images/older-brother.svg`
- Create: `content/images/younger-brother.svg`
- Create: `content/images/older-sister.svg`
- Create: `content/images/younger-sister.svg`
- Create: `content/images/big.svg`
- Create: `content/images/small.svg`
- Create: `content/images/cat.svg`
- Create: `content/images/dog.svg`
- Create: `content/images/number-1.svg` through `content/images/number-10.svg` (10 files)
- Modify: `content/vocab.test.ts`

**Interfaces:** None — this task adds static assets and extends Task 1's test file. No functions are produced or consumed.

Every illustration shares a 200x200 viewBox with a rounded-square background colored by category (greetings `#FDE68A`, people `#BFDBFE`, family `#FBCFE8`, descriptors/animals `#BBF7D0`/`#FED7AA`, numbers `#DDD6FE`), matching each vocab item's `slug`.

- [ ] **Step 1: Extend the failing test**

Add to `content/vocab.test.ts` (after the existing `describe` block):

```ts
import { existsSync } from 'node:fs'
import path from 'node:path'

describe('vocab images', () => {
  it('has a matching SVG image file for every item', () => {
    for (const item of VOCAB_ITEMS) {
      const imagePath = path.resolve(import.meta.dirname, 'images', `${item.slug}.svg`)
      expect(existsSync(imagePath)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- vocab.test.ts`
Expected: FAIL — no files exist under `content/images/`.

- [ ] **Step 3: Create the 8 greetings illustrations**

Create `content/images/hello.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <ellipse cx="100" cy="130" rx="30" ry="36" fill="#92400E"/>
  <rect x="82" y="50" width="14" height="60" rx="7" fill="#92400E"/>
  <rect x="100" y="46" width="14" height="64" rx="7" fill="#92400E"/>
  <rect x="118" y="52" width="14" height="58" rx="7" fill="#92400E"/>
  <rect x="64" y="58" width="14" height="52" rx="7" fill="#92400E" transform="rotate(-18 71 84)"/>
</svg>
```

Create `content/images/hello-everyone.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <circle cx="60" cy="110" r="26" fill="#92400E"/>
  <circle cx="100" cy="95" r="30" fill="#92400E"/>
  <circle cx="142" cy="112" r="26" fill="#92400E"/>
  <path d="M40 150 q60 -30 120 0" stroke="#FFFFFF" stroke-width="8" fill="none" stroke-linecap="round"/>
</svg>
```

Create `content/images/good-morning.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <rect x="20" y="140" width="160" height="10" rx="5" fill="#92400E"/>
  <path d="M40 140 A60 60 0 0 1 160 140 Z" fill="#F59E0B"/>
  <g stroke="#92400E" stroke-width="6" stroke-linecap="round">
    <line x1="100" y1="50" x2="100" y2="66"/>
    <line x1="56" y1="66" x2="66" y2="76"/>
    <line x1="144" y1="66" x2="134" y2="76"/>
  </g>
</svg>
```

Create `content/images/good-evening.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <path d="M120 60a50 50 0 1 0 0 80 40 40 0 1 1 0 -80z" fill="#92400E"/>
  <circle cx="140" cy="60" r="6" fill="#92400E"/>
  <circle cx="160" cy="90" r="4" fill="#92400E"/>
</svg>
```

Create `content/images/goodbye.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <ellipse cx="100" cy="130" rx="30" ry="36" fill="#B45309"/>
  <rect x="82" y="50" width="14" height="60" rx="7" fill="#B45309" transform="rotate(-10 89 80)"/>
  <rect x="100" y="46" width="14" height="64" rx="7" fill="#B45309" transform="rotate(-4 107 78)"/>
  <rect x="118" y="52" width="14" height="58" rx="7" fill="#B45309" transform="rotate(4 125 81)"/>
  <rect x="64" y="70" width="14" height="46" rx="7" fill="#B45309" transform="rotate(-30 71 93)"/>
</svg>
```

Create `content/images/thank-you.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <path d="M100 50 C70 60 60 100 70 150 L100 140 Z" fill="#92400E"/>
  <path d="M100 50 C130 60 140 100 130 150 L100 140 Z" fill="#B45309"/>
</svg>
```

Create `content/images/excuse-me.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <rect x="76" y="90" width="48" height="60" rx="16" fill="#92400E"/>
  <rect x="70" y="50" width="14" height="56" rx="7" fill="#92400E"/>
  <rect x="88" y="42" width="14" height="64" rx="7" fill="#92400E"/>
  <rect x="106" y="42" width="14" height="64" rx="7" fill="#92400E"/>
  <rect x="124" y="50" width="14" height="56" rx="7" fill="#92400E"/>
</svg>
```

Create `content/images/sorry.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FDE68A"/>
  <circle cx="100" cy="100" r="55" fill="#FCD34D" stroke="#92400E" stroke-width="6"/>
  <circle cx="80" cy="90" r="7" fill="#92400E"/>
  <circle cx="120" cy="90" r="7" fill="#92400E"/>
  <path d="M75 130 q25 -20 50 0" stroke="#92400E" stroke-width="6" fill="none" stroke-linecap="round"/>
  <ellipse cx="80" cy="112" rx="5" ry="9" fill="#60A5FA"/>
</svg>
```

- [ ] **Step 4: Create the 3 people illustrations**

Create `content/images/i-me.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#BFDBFE"/>
  <circle cx="100" cy="70" r="28" fill="#1E3A8A"/>
  <path d="M60 160 q40 -50 80 0 z" fill="#1E3A8A"/>
  <circle cx="100" cy="120" r="10" fill="#FFFFFF"/>
</svg>
```

Create `content/images/you.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#BFDBFE"/>
  <circle cx="90" cy="70" r="28" fill="#1E3A8A"/>
  <path d="M50 160 q40 -50 80 0 z" fill="#1E3A8A"/>
  <rect x="130" y="95" width="55" height="14" rx="7" fill="#1E3A8A"/>
  <path d="M175 88 l20 14 l-20 14 z" fill="#1E3A8A"/>
</svg>
```

Create `content/images/teacher.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#BFDBFE"/>
  <circle cx="80" cy="70" r="26" fill="#1E3A8A"/>
  <path d="M45 160 q35 -46 70 0 z" fill="#1E3A8A"/>
  <rect x="125" y="60" width="55" height="40" rx="4" fill="#FFFFFF" stroke="#1E3A8A" stroke-width="5"/>
  <line x1="133" y1="75" x2="170" y2="75" stroke="#1E3A8A" stroke-width="4"/>
  <line x1="133" y1="87" x2="160" y2="87" stroke="#1E3A8A" stroke-width="4"/>
</svg>
```

- [ ] **Step 5: Create the 6 family illustrations**

Create `content/images/mom.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FBCFE8"/>
  <circle cx="100" cy="70" r="28" fill="#9D174D"/>
  <path d="M55 165 q45 -60 90 0 z" fill="#9D174D"/>
  <path d="M100 140 c-10 -12 -28 -4 -28 10 c0 14 28 26 28 26 s28 -12 28 -26 c0 -14 -18 -22 -28 -10z" fill="#F472B6"/>
</svg>
```

Create `content/images/dad.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FBCFE8"/>
  <circle cx="100" cy="70" r="28" fill="#831843"/>
  <rect x="65" y="110" width="70" height="60" rx="10" fill="#831843"/>
  <path d="M100 140 c-10 -12 -28 -4 -28 10 c0 14 28 26 28 26 s28 -12 28 -26 c0 -14 -18 -22 -28 -10z" fill="#F472B6"/>
</svg>
```

Create `content/images/older-brother.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FBCFE8"/>
  <circle cx="100" cy="55" r="24" fill="#1D4ED8"/>
  <rect x="70" y="90" width="60" height="80" rx="10" fill="#1D4ED8"/>
</svg>
```

Create `content/images/younger-brother.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FBCFE8"/>
  <circle cx="100" cy="95" r="18" fill="#3B82F6"/>
  <rect x="78" y="120" width="44" height="55" rx="8" fill="#3B82F6"/>
</svg>
```

Create `content/images/older-sister.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FBCFE8"/>
  <circle cx="100" cy="55" r="24" fill="#BE185D"/>
  <path d="M65 170 q35 -85 70 0 z" fill="#BE185D"/>
  <path d="M76 40 q24 -20 48 0 q-6 20 -24 20 q-18 0 -24 -20z" fill="#831843"/>
</svg>
```

Create `content/images/younger-sister.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FBCFE8"/>
  <circle cx="100" cy="95" r="18" fill="#EC4899"/>
  <path d="M80 175 q20 -60 40 0 z" fill="#EC4899"/>
</svg>
```

- [ ] **Step 6: Create the 2 descriptor and 2 animal illustrations**

Create `content/images/big.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#BBF7D0"/>
  <circle cx="100" cy="100" r="75" fill="#065F46"/>
</svg>
```

Create `content/images/small.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#BBF7D0"/>
  <circle cx="100" cy="100" r="22" fill="#065F46"/>
</svg>
```

Create `content/images/cat.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FED7AA"/>
  <circle cx="100" cy="110" r="50" fill="#9A3412"/>
  <path d="M60 80 l10 -35 l25 30z" fill="#9A3412"/>
  <path d="M140 80 l-10 -35 l-25 30z" fill="#9A3412"/>
  <circle cx="82" cy="105" r="7" fill="#FFF7ED"/>
  <circle cx="118" cy="105" r="7" fill="#FFF7ED"/>
  <path d="M92 128 q8 8 16 0" stroke="#FFF7ED" stroke-width="4" fill="none" stroke-linecap="round"/>
  <g stroke="#FFF7ED" stroke-width="3">
    <line x1="45" y1="115" x2="75" y2="120"/>
    <line x1="45" y1="130" x2="75" y2="128"/>
    <line x1="155" y1="115" x2="125" y2="120"/>
    <line x1="155" y1="130" x2="125" y2="128"/>
  </g>
</svg>
```

Create `content/images/dog.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#FED7AA"/>
  <circle cx="100" cy="110" r="50" fill="#C2703D"/>
  <ellipse cx="58" cy="95" rx="18" ry="30" fill="#92400E" transform="rotate(-20 58 95)"/>
  <ellipse cx="142" cy="95" rx="18" ry="30" fill="#92400E" transform="rotate(20 142 95)"/>
  <circle cx="82" cy="105" r="7" fill="#1C1917"/>
  <circle cx="118" cy="105" r="7" fill="#1C1917"/>
  <ellipse cx="100" cy="130" rx="16" ry="12" fill="#FFEDD5"/>
  <circle cx="100" cy="124" r="6" fill="#1C1917"/>
</svg>
```

- [ ] **Step 7: Create the 10 number illustrations**

Each shows the numeral plus a matching count of dots, so recognizing the quantity doesn't depend on reading the digit alone.

Create `content/images/number-1.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="115" font-family="Arial, sans-serif" font-size="90" font-weight="700" fill="#4C1D95" text-anchor="middle">1</text>
  <circle cx="100" cy="165" r="8" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-2.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="115" font-family="Arial, sans-serif" font-size="90" font-weight="700" fill="#4C1D95" text-anchor="middle">2</text>
  <circle cx="88" cy="165" r="8" fill="#4C1D95"/>
  <circle cx="112" cy="165" r="8" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-3.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="115" font-family="Arial, sans-serif" font-size="90" font-weight="700" fill="#4C1D95" text-anchor="middle">3</text>
  <circle cx="76" cy="165" r="8" fill="#4C1D95"/>
  <circle cx="100" cy="165" r="8" fill="#4C1D95"/>
  <circle cx="124" cy="165" r="8" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-4.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="115" font-family="Arial, sans-serif" font-size="90" font-weight="700" fill="#4C1D95" text-anchor="middle">4</text>
  <circle cx="70" cy="165" r="8" fill="#4C1D95"/>
  <circle cx="90" cy="165" r="8" fill="#4C1D95"/>
  <circle cx="110" cy="165" r="8" fill="#4C1D95"/>
  <circle cx="130" cy="165" r="8" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-5.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="115" font-family="Arial, sans-serif" font-size="90" font-weight="700" fill="#4C1D95" text-anchor="middle">5</text>
  <circle cx="64" cy="165" r="7" fill="#4C1D95"/>
  <circle cx="82" cy="165" r="7" fill="#4C1D95"/>
  <circle cx="100" cy="165" r="7" fill="#4C1D95"/>
  <circle cx="118" cy="165" r="7" fill="#4C1D95"/>
  <circle cx="136" cy="165" r="7" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-6.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="105" font-family="Arial, sans-serif" font-size="80" font-weight="700" fill="#4C1D95" text-anchor="middle">6</text>
  <circle cx="76" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="100" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="124" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="76" cy="172" r="7" fill="#4C1D95"/>
  <circle cx="100" cy="172" r="7" fill="#4C1D95"/>
  <circle cx="124" cy="172" r="7" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-7.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="105" font-family="Arial, sans-serif" font-size="80" font-weight="700" fill="#4C1D95" text-anchor="middle">7</text>
  <circle cx="70" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="90" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="110" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="130" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="80" cy="172" r="7" fill="#4C1D95"/>
  <circle cx="100" cy="172" r="7" fill="#4C1D95"/>
  <circle cx="120" cy="172" r="7" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-8.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="105" font-family="Arial, sans-serif" font-size="80" font-weight="700" fill="#4C1D95" text-anchor="middle">8</text>
  <circle cx="70" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="90" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="110" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="130" cy="152" r="7" fill="#4C1D95"/>
  <circle cx="70" cy="172" r="7" fill="#4C1D95"/>
  <circle cx="90" cy="172" r="7" fill="#4C1D95"/>
  <circle cx="110" cy="172" r="7" fill="#4C1D95"/>
  <circle cx="130" cy="172" r="7" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-9.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="105" font-family="Arial, sans-serif" font-size="80" font-weight="700" fill="#4C1D95" text-anchor="middle">9</text>
  <circle cx="64" cy="152" r="6" fill="#4C1D95"/>
  <circle cx="82" cy="152" r="6" fill="#4C1D95"/>
  <circle cx="100" cy="152" r="6" fill="#4C1D95"/>
  <circle cx="118" cy="152" r="6" fill="#4C1D95"/>
  <circle cx="136" cy="152" r="6" fill="#4C1D95"/>
  <circle cx="73" cy="172" r="6" fill="#4C1D95"/>
  <circle cx="91" cy="172" r="6" fill="#4C1D95"/>
  <circle cx="109" cy="172" r="6" fill="#4C1D95"/>
  <circle cx="127" cy="172" r="6" fill="#4C1D95"/>
</svg>
```

Create `content/images/number-10.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="24" fill="#DDD6FE"/>
  <text x="100" y="100" font-family="Arial, sans-serif" font-size="66" font-weight="700" fill="#4C1D95" text-anchor="middle">10</text>
  <circle cx="64" cy="150" r="6" fill="#4C1D95"/>
  <circle cx="82" cy="150" r="6" fill="#4C1D95"/>
  <circle cx="100" cy="150" r="6" fill="#4C1D95"/>
  <circle cx="118" cy="150" r="6" fill="#4C1D95"/>
  <circle cx="136" cy="150" r="6" fill="#4C1D95"/>
  <circle cx="64" cy="170" r="6" fill="#4C1D95"/>
  <circle cx="82" cy="170" r="6" fill="#4C1D95"/>
  <circle cx="100" cy="170" r="6" fill="#4C1D95"/>
  <circle cx="118" cy="170" r="6" fill="#4C1D95"/>
  <circle cx="136" cy="170" r="6" fill="#4C1D95"/>
</svg>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- vocab.test.ts`
Expected: PASS (all 6 tests, including the new image-coverage test)

- [ ] **Step 9: Commit**

```bash
git add content/images content/vocab.test.ts
git commit -m "feat: add flat SVG illustrations for all vocabulary items"
```

---

## Task 3: Database Migration — Content Tables and Storage Buckets

**Files:**
- Create: `supabase/migrations/0002_create_content_tables.sql`

**Interfaces:** None — schema only. Produces the `levels`, `vocab_items`, `level_vocab` tables and `vocab-audio`/`vocab-images` Storage buckets consumed by Task 4's repository functions.

**Manual setup required first:** none beyond what Plan 1 already set up — this reuses the same Supabase project.

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0002_create_content_tables.sql`:

```sql
create table levels (
  id integer primary key,
  name text not null,
  "order" integer not null,
  unlock_threshold integer not null default 0
);

create table vocab_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  cantonese_text text not null,
  jyutping text not null,
  english_gloss text not null,
  homophone_group text,
  audio_url text,
  image_url text,
  created_at timestamptz not null default now()
);

create table level_vocab (
  level_id integer not null references levels(id) on delete cascade,
  vocab_item_id uuid not null references vocab_items(id) on delete cascade,
  primary key (level_id, vocab_item_id)
);

alter table levels enable row level security;
alter table vocab_items enable row level security;
alter table level_vocab enable row level security;

insert into storage.buckets (id, name, public) values ('vocab-audio', 'vocab-audio', true);
insert into storage.buckets (id, name, public) values ('vocab-images', 'vocab-images', true);

create policy "vocab-audio is publicly readable" on storage.objects
  for select using (bucket_id = 'vocab-audio');

create policy "vocab-images is publicly readable" on storage.objects
  for select using (bucket_id = 'vocab-images');
```

Run this file's contents in the Supabase SQL Editor against your project (Table Editor → SQL Editor, same project used in Plan 1).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0002_create_content_tables.sql
git commit -m "feat: add content tables and public storage buckets migration"
```

---

## Task 4: Content Repository Functions

**Files:**
- Create: `src/lib/db/content.ts`
- Test: `src/lib/db/content.test.ts`

**Interfaces:**
- Consumes: `LevelSource`, `VocabSourceItem` shapes from `content/vocab.ts` (Task 1) as reference for field naming, `SupabaseClient` type.
- Produces: `VocabItemInput` interface (`{ slug: string; category: string; cantoneseText: string; jyutping: string; englishGloss: string; homophoneGroup: string | null; audioUrl: string; imageUrl: string }`), `upsertLevel(supabase, level: LevelSource): Promise<void>`, `upsertVocabItem(supabase, item: VocabItemInput): Promise<{ id: string }>`, `linkVocabToLevel(supabase, levelId: number, vocabItemId: string): Promise<void>` from `@/lib/db/content` — consumed by Task 7's sync script.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/db/content.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertLevel, upsertVocabItem, linkVocabToLevel } from './content'

function makeSupabaseMock(overrides: {
  upsertResult?: { error: unknown }
  singleResult?: { data: unknown; error: unknown }
}) {
  const single = vi.fn().mockResolvedValue(overrides.singleResult ?? { data: null, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const upsert = vi.fn().mockReturnValue({
    select,
    then: (resolve: (value: { error: unknown }) => void) =>
      resolve(overrides.upsertResult ?? { error: null }),
  })
  const from = vi.fn().mockReturnValue({ upsert })
  return { from } as unknown as SupabaseClient
}

describe('upsertLevel', () => {
  it('resolves when the upsert succeeds', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: null } })
    await expect(
      upsertLevel(supabase, { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 })
    ).resolves.toBeUndefined()
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: { message: 'boom' } } })
    await expect(
      upsertLevel(supabase, { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 })
    ).rejects.toThrow('Failed to upsert level 1: boom')
  })
})

describe('upsertVocabItem', () => {
  it('returns the upserted item id', async () => {
    const supabase = makeSupabaseMock({ singleResult: { data: { id: 'v1' }, error: null } })
    const result = await upsertVocabItem(supabase, {
      slug: 'hello',
      category: 'greetings',
      cantoneseText: '你好',
      jyutping: 'nei5 hou2',
      englishGloss: 'hello',
      homophoneGroup: null,
      audioUrl: 'https://example.com/hello.mp3',
      imageUrl: 'https://example.com/hello.svg',
    })
    expect(result).toEqual({ id: 'v1' })
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeSupabaseMock({ singleResult: { data: null, error: { message: 'dup' } } })
    await expect(
      upsertVocabItem(supabase, {
        slug: 'hello',
        category: 'greetings',
        cantoneseText: '你好',
        jyutping: 'nei5 hou2',
        englishGloss: 'hello',
        homophoneGroup: null,
        audioUrl: 'https://example.com/hello.mp3',
        imageUrl: 'https://example.com/hello.svg',
      })
    ).rejects.toThrow('Failed to upsert vocab item hello: dup')
  })
})

describe('linkVocabToLevel', () => {
  it('resolves when the upsert succeeds', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: null } })
    await expect(linkVocabToLevel(supabase, 1, 'v1')).resolves.toBeUndefined()
  })

  it('throws when the upsert fails', async () => {
    const supabase = makeSupabaseMock({ upsertResult: { error: { message: 'boom' } } })
    await expect(linkVocabToLevel(supabase, 1, 'v1')).rejects.toThrow(
      'Failed to link vocab item v1 to level 1: boom'
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- content.test.ts`
Expected: FAIL — `./content` does not exist.

- [ ] **Step 3: Implement `src/lib/db/content.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LevelSource } from '../../../content/vocab'

export async function upsertLevel(supabase: SupabaseClient, level: LevelSource): Promise<void> {
  const { error } = await supabase
    .from('levels')
    .upsert({ id: level.id, name: level.name, order: level.order, unlock_threshold: level.unlockThreshold })

  if (error) {
    throw new Error(`Failed to upsert level ${level.id}: ${error.message}`)
  }
}

export interface VocabItemInput {
  slug: string
  category: string
  cantoneseText: string
  jyutping: string
  englishGloss: string
  homophoneGroup: string | null
  audioUrl: string
  imageUrl: string
}

export async function upsertVocabItem(
  supabase: SupabaseClient,
  item: VocabItemInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('vocab_items')
    .upsert(
      {
        slug: item.slug,
        category: item.category,
        cantonese_text: item.cantoneseText,
        jyutping: item.jyutping,
        english_gloss: item.englishGloss,
        homophone_group: item.homophoneGroup,
        audio_url: item.audioUrl,
        image_url: item.imageUrl,
      },
      { onConflict: 'slug' }
    )
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to upsert vocab item ${item.slug}: ${error?.message ?? 'unknown error'}`)
  }
  return data as { id: string }
}

export async function linkVocabToLevel(
  supabase: SupabaseClient,
  levelId: number,
  vocabItemId: string
): Promise<void> {
  const { error } = await supabase
    .from('level_vocab')
    .upsert({ level_id: levelId, vocab_item_id: vocabItemId }, { onConflict: 'level_id,vocab_item_id' })

  if (error) {
    throw new Error(`Failed to link vocab item ${vocabItemId} to level ${levelId}: ${error.message}`)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- content.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/content.ts src/lib/db/content.test.ts
git commit -m "feat: add content repository functions for levels and vocab items"
```

---

## Task 5: Cantonese Text-to-Speech Utility

**Files:**
- Modify: `package.json` (add `@google-cloud/text-to-speech` dependency)
- Create: `src/lib/content/tts.ts`
- Test: `src/lib/content/tts.test.ts`

**Interfaces:**
- Produces: `createTtsClient(): TextToSpeechClient`, `synthesizeCantonese(client: TextToSpeechClient, text: string): Promise<Buffer>` from `@/lib/content/tts` — consumed by Task 7's sync script.

**Manual setup required before running the sync script (Task 8), not before this task's tests:** a Google Cloud project with the Text-to-Speech API enabled and a service account JSON key, with `GOOGLE_APPLICATION_CREDENTIALS` pointing to that key file locally. This task's tests mock the client entirely and need no real credentials.

- [ ] **Step 1: Add the dependency**

Run: `npm install @google-cloud/text-to-speech@5.9.0`

- [ ] **Step 2: Write the failing tests**

Create `src/lib/content/tts.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { TextToSpeechClient } from '@google-cloud/text-to-speech'
import { synthesizeCantonese } from './tts'

function makeClientMock(audioContent: Uint8Array | null) {
  return {
    synthesizeSpeech: vi.fn().mockResolvedValue([{ audioContent }]),
  } as unknown as TextToSpeechClient
}

describe('synthesizeCantonese', () => {
  it('returns audio content as a Buffer', async () => {
    const client = makeClientMock(new Uint8Array([1, 2, 3]))
    const buffer = await synthesizeCantonese(client, '你好')
    expect(buffer).toBeInstanceOf(Buffer)
    expect(Array.from(buffer)).toEqual([1, 2, 3])
  })

  it('calls synthesizeSpeech with the Cantonese voice config', async () => {
    const client = makeClientMock(new Uint8Array([1]))
    await synthesizeCantonese(client, '你好')
    expect(client.synthesizeSpeech).toHaveBeenCalledWith({
      input: { text: '你好' },
      voice: { languageCode: 'yue-HK', name: 'yue-HK-Standard-A' },
      audioConfig: { audioEncoding: 'MP3' },
    })
  })

  it('throws when no audio content is returned', async () => {
    const client = makeClientMock(null)
    await expect(synthesizeCantonese(client, '你好')).rejects.toThrow('No audio returned for text: 你好')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tts.test.ts`
Expected: FAIL — `./tts` does not exist.

- [ ] **Step 4: Implement `src/lib/content/tts.ts`**

```ts
import { TextToSpeechClient } from '@google-cloud/text-to-speech'

export function createTtsClient(): TextToSpeechClient {
  return new TextToSpeechClient()
}

export async function synthesizeCantonese(client: TextToSpeechClient, text: string): Promise<Buffer> {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: 'yue-HK', name: 'yue-HK-Standard-A' },
    audioConfig: { audioEncoding: 'MP3' },
  })

  if (!response.audioContent) {
    throw new Error(`No audio returned for text: ${text}`)
  }
  return Buffer.from(response.audioContent)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tts.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/content/tts.ts src/lib/content/tts.test.ts
git commit -m "feat: add Cantonese text-to-speech utility"
```

---

## Task 6: Storage Upload Utility

**Files:**
- Create: `src/lib/content/storage.ts`
- Test: `src/lib/content/storage.test.ts`

**Interfaces:**
- Produces: `uploadAsset(supabase: SupabaseClient, bucket: string, path: string, data: Buffer, contentType: string): Promise<string>` (returns the asset's public URL) from `@/lib/content/storage` — consumed by Task 7's sync script.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/content/storage.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadAsset } from './storage'

function makeSupabaseMock(uploadError: { message: string } | null, publicUrl: string) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError })
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl } })
  const from = vi.fn().mockReturnValue({ upload, getPublicUrl })
  return { storage: { from } } as unknown as SupabaseClient
}

describe('uploadAsset', () => {
  it('uploads the file and returns its public URL', async () => {
    const supabase = makeSupabaseMock(
      null,
      'https://example.supabase.co/storage/v1/object/public/vocab-audio/hello.mp3'
    )
    const url = await uploadAsset(supabase, 'vocab-audio', 'hello.mp3', Buffer.from([1]), 'audio/mpeg')
    expect(url).toBe('https://example.supabase.co/storage/v1/object/public/vocab-audio/hello.mp3')
  })

  it('throws when the upload fails', async () => {
    const supabase = makeSupabaseMock({ message: 'bucket not found' }, '')
    await expect(
      uploadAsset(supabase, 'vocab-audio', 'hello.mp3', Buffer.from([1]), 'audio/mpeg')
    ).rejects.toThrow('Failed to upload hello.mp3 to vocab-audio: bucket not found')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- storage.test.ts`
Expected: FAIL — `./storage` does not exist.

- [ ] **Step 3: Implement `src/lib/content/storage.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function uploadAsset(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
  })

  if (error) {
    throw new Error(`Failed to upload ${path} to ${bucket}: ${error.message}`)
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path)
  return publicUrlData.publicUrl
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/storage.ts src/lib/content/storage.test.ts
git commit -m "feat: add Supabase Storage upload utility"
```

---

## Task 7: Content Sync Script

**Files:**
- Modify: `package.json` (add `tsx` devDependency and `sync-content` script)
- Create: `scripts/sync-content.ts`

**Interfaces:**
- Consumes: `LEVELS`, `VOCAB_ITEMS` (`content/vocab.ts`), `createSupabaseServerClient` (`@/lib/supabase/client`), `createTtsClient`, `synthesizeCantonese` (`@/lib/content/tts`), `uploadAsset` (`@/lib/content/storage`), `upsertLevel`, `upsertVocabItem`, `linkVocabToLevel` (`@/lib/db/content`).
- Produces: nothing consumed by later tasks — this is the pipeline's terminal entrypoint, run manually.

This script is intentionally untested by automated tests: every piece of real logic it calls (TTS synthesis, upload, upserts) already has its own test coverage from Tasks 4-6. The script itself is thin orchestration, verified by actually running it in Task 8.

- [ ] **Step 1: Add `tsx` and the npm script**

Run: `npm install --save-dev tsx@4.19.2`

Add to `package.json`'s `"scripts"` block:

```json
    "sync-content": "tsx scripts/sync-content.ts"
```

- [ ] **Step 2: Implement `scripts/sync-content.ts`**

```ts
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
```

- [ ] **Step 3: Verify the project still builds and lints**

Run: `npm run lint && npm run build`
Expected: both succeed (the script isn't part of the Next.js build, but this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/sync-content.ts
git commit -m "feat: add content sync script"
```

---

## Task 8: Run the Content Sync Against Live Supabase

**Files:** None — this task is infrastructure/content execution, verified manually.

- [ ] **Step 1: Set up Google Cloud Text-to-Speech**

In the Google Cloud Console: create a project (or reuse one), enable the "Cloud Text-to-Speech API," create a service account with the "Cloud Text-to-Speech User" role, and download its JSON key.

- [ ] **Step 2: Run the migration**

Open the Supabase SQL Editor for the project used in Plan 1, and run the contents of `supabase/migrations/0002_create_content_tables.sql`.

- [ ] **Step 3: Set local credentials**

In your `.env.local` (already gitignored), ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (from Plan 1), and add:

```
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/your-service-account-key.json
```

- [ ] **Step 4: Run the sync script**

Run: `npm run sync-content`

Expected: console output listing each of the 4 levels and 31 vocab items as they're synced, ending with `Done. Synced 31 vocab items across 4 levels.`

- [ ] **Step 5: Verify in Supabase**

In the Supabase Table Editor, confirm `levels` has 4 rows, `vocab_items` has 31 rows each with non-null `audio_url` and `image_url`, and `level_vocab` has 31 rows. In Storage, confirm the `vocab-audio` and `vocab-images` buckets each have 31 files. Open a couple of the public URLs directly in a browser to confirm the audio plays and the SVG renders.

---

## Plan Complete

At the end of this plan: the live Supabase project holds 4 levels and 31 fully-populated vocab items (Cantonese text, jyutping, English gloss, real audio, and a matching illustration), all reproducible from committed source data via `npm run sync-content`. This unblocks Plan 3 (Core Game Loop: Listen & Tap), which will be the first plan to actually query and display this content.
