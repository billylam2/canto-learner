# Core Game Loop: Listen & Tap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in kid choose an unlocked level, play through it in the "Listen & Tap" game (hear a Cantonese word, tap the matching picture), and have their star progress saved and reflected in which levels unlock next.

**Architecture:** `/play` and `/play/[levelId]` are server components that read the session and fetch data (levels from the existing `content/vocab.ts` constant, progress from a new `progress` table) directly — no new GET API routes. The level page hands vocab data to a client component, `ListenTapGame`, which owns all round/question state and POSTs the final result once to `/api/progress` when the level finishes. Round-splitting and distractor-selection are pure, independently-tested functions with no framework dependencies.

**Tech Stack:** TypeScript, Next.js (App Router), React, Supabase, Vitest, React Testing Library — all already in the project from Plans 1-2.

**Spec:** `docs/superpowers/specs/2026-09-14-cantonese-kids-app-design.md`

## Global Constraints

- A level playthrough is one continuous client-side session; progress is saved exactly once, at the end, via `POST /api/progress` — there is no mid-level resume/checkpoint persistence.
- Words within a level are split into contiguous chunks of at most 4, as evenly as possible (e.g. 8 words → 4+4, 9 → 3+3+3, 4 → 4, 10 → 4+3+3).
- Star scoring: 3 stars for a correct answer on the first try, 1 star for a correct answer after at least one retry.
- `progress.stars_earned` is a per-level **best score ever** — replaying and doing worse never lowers it (`Math.max` on write, not additive).
- A level is unlocked when the sum of `stars_earned` across all of a kid's `progress` rows is `>=` that level's `unlockThreshold`, as defined in `content/vocab.ts`'s `LEVELS` constant (not a separate DB read).
- Every question has exactly 3 choices: the correct answer plus 2 distractors drawn from the same level's other vocab items, never including an item that shares the target's `homophoneGroup`.
- `/play/[levelId]` must redirect to `/play` if the level is locked for the current kid, enforced server-side — not just hidden client-side.
- The game UI never receives or displays a vocab item's Cantonese text, jyutping, or English gloss — only `{ id, slug, audioUrl, imageUrl, homophoneGroup }`.
- The `progress` table gets Row Level Security enabled with no policies (service-role-only access), matching the `kids` table pattern from Plan 1.

---

## Task 1: Progress Table and Repository

**Files:**
- Create: `supabase/migrations/0003_create_progress.sql`
- Create: `src/lib/db/progress.ts`
- Test: `src/lib/db/progress.test.ts`

**Interfaces:**
- Produces: `ProgressRow` interface (`{ levelId: number; starsEarned: number; completedGameTypes: string[] }`), `getProgressForKid(supabase, kidId: string): Promise<ProgressRow[]>`, `saveLevelProgress(supabase, kidId: string, levelId: number, starsEarned: number, gameType: string): Promise<void>` from `@/lib/db/progress` — consumed by Task 2 (level-select page), Task 4 (level game page), and Task 6 (progress API route).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0003_create_progress.sql`:

```sql
create table progress (
  kid_id uuid not null references kids(id) on delete cascade,
  level_id integer not null references levels(id) on delete cascade,
  stars_earned integer not null default 0,
  completed_game_types text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (kid_id, level_id)
);

alter table progress enable row level security;
```

Run this file's contents in the Supabase SQL Editor against your project.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/db/progress.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getProgressForKid, saveLevelProgress } from './progress'

function makeSupabaseMock(overrides: {
  listResult?: { data: unknown; error: unknown }
  maybeSingleResult?: { data: unknown; error: unknown }
  upsertResult?: { error: unknown }
}) {
  const maybeSingle = vi.fn().mockResolvedValue(overrides.maybeSingleResult ?? { data: null, error: null })
  const chain = {
    eq: vi.fn(),
    maybeSingle,
    then: (resolve: (value: unknown) => void) => resolve(overrides.listResult ?? { data: [], error: null }),
  }
  chain.eq.mockReturnValue(chain)
  const select = vi.fn().mockReturnValue(chain)
  const upsert = vi.fn().mockResolvedValue(overrides.upsertResult ?? { error: null })
  const from = vi.fn().mockReturnValue({ select, upsert })
  const supabase = { from } as unknown as SupabaseClient
  return { supabase, upsert }
}

describe('getProgressForKid', () => {
  it('returns mapped progress rows', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: {
        data: [{ level_id: 1, stars_earned: 10, completed_game_types: ['listen-tap'] }],
        error: null,
      },
    })
    const result = await getProgressForKid(supabase, 'kid-1')
    expect(result).toEqual([{ levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] }])
  })

  it('throws when the query errors', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: null, error: { message: 'boom' } } })
    await expect(getProgressForKid(supabase, 'kid-1')).rejects.toThrow(
      'Failed to fetch progress for kid kid-1: boom'
    )
  })
})

describe('saveLevelProgress', () => {
  it('creates a new progress row when none exists', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: null, error: null },
      upsertResult: { error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 12, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kid_id: 'kid-1',
        level_id: 1,
        stars_earned: 12,
        completed_game_types: ['listen-tap'],
      }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('keeps the higher star total on replay', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: { stars_earned: 20, completed_game_types: ['listen-tap'] }, error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 12, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ stars_earned: 20 }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('replaces a lower star total with a new best', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: { stars_earned: 5, completed_game_types: ['listen-tap'] }, error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 18, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ stars_earned: 18 }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('adds a new game type without duplicating existing ones', async () => {
    const { supabase, upsert } = makeSupabaseMock({
      maybeSingleResult: { data: { stars_earned: 5, completed_game_types: ['listen-tap'] }, error: null },
    })
    await saveLevelProgress(supabase, 'kid-1', 1, 5, 'listen-tap')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ completed_game_types: ['listen-tap'] }),
      { onConflict: 'kid_id,level_id' }
    )
  })

  it('throws when the upsert fails', async () => {
    const { supabase } = makeSupabaseMock({
      maybeSingleResult: { data: null, error: null },
      upsertResult: { error: { message: 'boom' } },
    })
    await expect(saveLevelProgress(supabase, 'kid-1', 1, 5, 'listen-tap')).rejects.toThrow(
      'Failed to save progress: boom'
    )
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- progress.test.ts`
Expected: FAIL — `./progress` does not exist.

- [ ] **Step 4: Implement `src/lib/db/progress.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProgressRow {
  levelId: number
  starsEarned: number
  completedGameTypes: string[]
}

export async function getProgressForKid(supabase: SupabaseClient, kidId: string): Promise<ProgressRow[]> {
  const { data, error } = await supabase
    .from('progress')
    .select('level_id, stars_earned, completed_game_types')
    .eq('kid_id', kidId)

  if (error) {
    throw new Error(`Failed to fetch progress for kid ${kidId}: ${error.message}`)
  }

  return (data ?? []).map((row: { level_id: number; stars_earned: number; completed_game_types: string[] }) => ({
    levelId: row.level_id,
    starsEarned: row.stars_earned,
    completedGameTypes: row.completed_game_types,
  }))
}

export async function saveLevelProgress(
  supabase: SupabaseClient,
  kidId: string,
  levelId: number,
  starsEarned: number,
  gameType: string
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('progress')
    .select('stars_earned, completed_game_types')
    .eq('kid_id', kidId)
    .eq('level_id', levelId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Failed to fetch existing progress: ${fetchError.message}`)
  }

  const bestStars = Math.max(existing?.stars_earned ?? 0, starsEarned)
  const existingGameTypes: string[] = existing?.completed_game_types ?? []
  const completedGameTypes = existingGameTypes.includes(gameType)
    ? existingGameTypes
    : [...existingGameTypes, gameType]

  const { error: upsertError } = await supabase.from('progress').upsert(
    {
      kid_id: kidId,
      level_id: levelId,
      stars_earned: bestStars,
      completed_game_types: completedGameTypes,
    },
    { onConflict: 'kid_id,level_id' }
  )

  if (upsertError) {
    throw new Error(`Failed to save progress: ${upsertError.message}`)
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- progress.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_create_progress.sql src/lib/db/progress.ts src/lib/db/progress.test.ts
git commit -m "feat: add progress table and repository"
```

---

## Task 2: Level Status Logic and Level-Select Page

**Files:**
- Create: `src/lib/game/level-status.ts`
- Test: `src/lib/game/level-status.test.ts`
- Create: `src/app/play/page.tsx`
- Test: `src/app/play/page.test.tsx`

**Interfaces:**
- Consumes: `ProgressRow` and `getProgressForKid` (`@/lib/db/progress`), `LevelSource` (`content/vocab.ts`), `readSessionFromCookieValue`, `COOKIE_NAME` (`@/lib/auth/session`), `createSupabaseServerClient` (`@/lib/supabase/client`).
- Produces: `LevelStatus` interface (`{ id: number; name: string; order: number; starsEarned: number; unlocked: boolean }`), `computeLevelStatus(levels: LevelSource[], progress: ProgressRow[]): LevelStatus[]` from `@/lib/game/level-status` — consumed by Task 4's level game page.

- [ ] **Step 1: Write the failing tests for level status**

Create `src/lib/game/level-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeLevelStatus } from './level-status'

const LEVELS = [
  { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 },
  { id: 2, name: 'People & Family', order: 2, unlockThreshold: 20 },
  { id: 3, name: 'Descriptors & Animals', order: 3, unlockThreshold: 40 },
]

describe('computeLevelStatus', () => {
  it('always unlocks a level with a 0 threshold', () => {
    const result = computeLevelStatus(LEVELS, [])
    expect(result[0]).toMatchObject({ id: 1, unlocked: true, starsEarned: 0 })
  })

  it('locks a level when total stars are below its threshold', () => {
    const result = computeLevelStatus(LEVELS, [{ levelId: 1, starsEarned: 10, completedGameTypes: [] }])
    expect(result[1]).toMatchObject({ id: 2, unlocked: false })
  })

  it('unlocks a level once total stars meet its threshold', () => {
    const result = computeLevelStatus(LEVELS, [{ levelId: 1, starsEarned: 24, completedGameTypes: [] }])
    expect(result[1]).toMatchObject({ id: 2, unlocked: true })
  })

  it('sums stars across multiple levels toward later thresholds', () => {
    const result = computeLevelStatus(LEVELS, [
      { levelId: 1, starsEarned: 24, completedGameTypes: [] },
      { levelId: 2, starsEarned: 20, completedGameTypes: [] },
    ])
    expect(result[2]).toMatchObject({ id: 3, unlocked: true })
  })

  it("reports each level's own stars earned", () => {
    const result = computeLevelStatus(LEVELS, [{ levelId: 2, starsEarned: 15, completedGameTypes: [] }])
    expect(result[1].starsEarned).toBe(15)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- level-status.test.ts`
Expected: FAIL — `./level-status` does not exist.

- [ ] **Step 3: Implement `src/lib/game/level-status.ts`**

```ts
import type { LevelSource } from '../../../content/vocab'
import type { ProgressRow } from '../db/progress'

export interface LevelStatus {
  id: number
  name: string
  order: number
  starsEarned: number
  unlocked: boolean
}

export function computeLevelStatus(levels: LevelSource[], progress: ProgressRow[]): LevelStatus[] {
  const starsByLevel = new Map(progress.map((row) => [row.levelId, row.starsEarned]))
  const totalStars = progress.reduce((sum, row) => sum + row.starsEarned, 0)

  return [...levels]
    .sort((a, b) => a.order - b.order)
    .map((level) => ({
      id: level.id,
      name: level.name,
      order: level.order,
      starsEarned: starsByLevel.get(level.id) ?? 0,
      unlocked: totalStars >= level.unlockThreshold,
    }))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- level-status.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the level-select page**

Create `src/app/play/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const redirectMock = vi.fn()
const getMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url)
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/progress', () => ({
  getProgressForKid: vi.fn(),
}))

import PlayPage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { createSessionCookieValue } from '@/lib/auth/session'

describe('PlayPage', () => {
  it('redirects to login when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    await expect(PlayPage()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })

  it('shows unlocked levels as links and locked levels as plain text', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    expect(screen.getByRole('link', { name: /Greetings/ })).toBeInTheDocument()
    expect(screen.getByText(/People & Family — locked/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- app/play/page.test.tsx`
Expected: FAIL — `./page` does not exist.

- [ ] **Step 7: Implement `src/app/play/page.tsx`**

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'

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
              <Link href={`/play/${level.id}`}>
                {level.name} — {level.starsEarned} stars
              </Link>
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

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- app/play/page.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/level-status.ts src/lib/game/level-status.test.ts src/app/play/page.tsx src/app/play/page.test.tsx
git commit -m "feat: add level status logic and level-select page"
```

---

## Task 3: Round Splitting and Distractor Selection

**Files:**
- Create: `src/lib/game/round.ts`
- Test: `src/lib/game/round.test.ts`

**Interfaces:**
- Produces: `VocabGameItem` interface (`{ id: string; slug: string; audioUrl: string; imageUrl: string; homophoneGroup: string | null }`), `buildRounds(items: VocabGameItem[], maxRoundSize?: number): VocabGameItem[][]`, `pickDistractors(pool: VocabGameItem[], target: VocabGameItem, count: number, random?: () => number): VocabGameItem[]` from `@/lib/game/round` — consumed by Task 4 (level game page passes `VocabGameItem[]` down) and Task 5 (`ListenTapGame` uses both functions).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game/round.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRounds, pickDistractors, type VocabGameItem } from './round'

function makeItem(overrides: Partial<VocabGameItem> & { id: string }): VocabGameItem {
  return {
    id: overrides.id,
    slug: overrides.slug ?? overrides.id,
    audioUrl: `https://example.com/${overrides.id}.mp3`,
    imageUrl: `https://example.com/${overrides.id}.svg`,
    homophoneGroup: overrides.homophoneGroup ?? null,
  }
}

describe('buildRounds', () => {
  it('splits 8 items into two rounds of 4', () => {
    const items = Array.from({ length: 8 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([4, 4])
  })

  it('splits 9 items into three rounds of 3', () => {
    const items = Array.from({ length: 9 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([3, 3, 3])
  })

  it('keeps 4 items in a single round', () => {
    const items = Array.from({ length: 4 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([4])
  })

  it('splits 10 items into rounds of 4, 3, 3', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem({ id: `${i}` }))
    expect(buildRounds(items).map((round) => round.length)).toEqual([4, 3, 3])
  })

  it('preserves item order across rounds', () => {
    const items = Array.from({ length: 8 }, (_, i) => makeItem({ id: `${i}` }))
    const flatIds = buildRounds(items)
      .flat()
      .map((item) => item.id)
    expect(flatIds).toEqual(items.map((item) => item.id))
  })
})

describe('pickDistractors', () => {
  const pool = [
    makeItem({ id: 'dog', homophoneGroup: 'gau2' }),
    makeItem({ id: 'nine', homophoneGroup: 'gau2' }),
    makeItem({ id: 'cat' }),
    makeItem({ id: 'big' }),
  ]

  it('never includes the target itself', () => {
    const target = pool[2]
    const distractors = pickDistractors(pool, target, 2)
    expect(distractors.some((item) => item.id === target.id)).toBe(false)
  })

  it('never includes a homophone of the target', () => {
    const target = pool[0]
    const distractors = pickDistractors(pool, target, 2)
    expect(distractors.some((item) => item.homophoneGroup === 'gau2')).toBe(false)
  })

  it('returns the requested count when enough candidates exist', () => {
    const target = pool[2]
    const distractors = pickDistractors(pool, target, 2)
    expect(distractors.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- round.test.ts`
Expected: FAIL — `./round` does not exist.

- [ ] **Step 3: Implement `src/lib/game/round.ts`**

```ts
export interface VocabGameItem {
  id: string
  slug: string
  audioUrl: string
  imageUrl: string
  homophoneGroup: string | null
}

export function buildRounds(items: VocabGameItem[], maxRoundSize = 4): VocabGameItem[][] {
  const roundCount = Math.ceil(items.length / maxRoundSize)
  const baseSize = Math.floor(items.length / roundCount)
  const remainder = items.length % roundCount

  const rounds: VocabGameItem[][] = []
  let cursor = 0
  for (let i = 0; i < roundCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0)
    rounds.push(items.slice(cursor, cursor + size))
    cursor += size
  }
  return rounds
}

export function pickDistractors(
  pool: VocabGameItem[],
  target: VocabGameItem,
  count: number,
  random: () => number = Math.random
): VocabGameItem[] {
  const candidates = pool.filter(
    (item) => item.id !== target.id && !(target.homophoneGroup && item.homophoneGroup === target.homophoneGroup)
  )

  const shuffled = [...candidates].sort(() => random() - 0.5)
  return shuffled.slice(0, count)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- round.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/round.ts src/lib/game/round.test.ts
git commit -m "feat: add round splitting and distractor selection logic"
```

---

## Task 4: Vocab-for-Level Fetch and Level Game Page

**Files:**
- Modify: `src/lib/db/content.ts` (add `getVocabItemsForLevel`)
- Modify: `src/lib/db/content.test.ts` (add tests for it)
- Create: `src/app/play/[levelId]/page.tsx`
- Test: `src/app/play/[levelId]/page.test.tsx`

**Interfaces:**
- Consumes: `VocabGameItem` (`@/lib/game/round`), `computeLevelStatus` (`@/lib/game/level-status`), `getProgressForKid` (`@/lib/db/progress`), `LEVELS` (`content/vocab.ts`), session utilities (`@/lib/auth/session`).
- Produces: `getVocabItemsForLevel(supabase, levelId: number): Promise<VocabGameItem[]>` from `@/lib/db/content` — consumed by this task's own page and, later, by other game types.

- [ ] **Step 1: Write the failing tests for the vocab-fetch function**

Add to `src/lib/db/content.test.ts` (append after the existing `describe` blocks, and add this import alongside the existing ones at the top):

```ts
import { getVocabItemsForLevel } from './content'
```

```ts
function makeLevelVocabMock(overrides: {
  linksResult?: { data: unknown; error: unknown }
  itemsResult?: { data: unknown; error: unknown }
}) {
  const eq = vi.fn().mockResolvedValue(overrides.linksResult ?? { data: [], error: null })
  const levelVocabSelect = vi.fn().mockReturnValue({ eq })

  const order = vi.fn().mockResolvedValue(overrides.itemsResult ?? { data: [], error: null })
  const inFn = vi.fn().mockReturnValue({ order })
  const vocabItemsSelect = vi.fn().mockReturnValue({ in: inFn })

  const from = vi.fn((table: string) => {
    if (table === 'level_vocab') return { select: levelVocabSelect }
    if (table === 'vocab_items') return { select: vocabItemsSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from } as unknown as SupabaseClient
}

describe('getVocabItemsForLevel', () => {
  it('returns vocab items mapped to camelCase, in database order', async () => {
    const supabase = makeLevelVocabMock({
      linksResult: { data: [{ vocab_item_id: 'v1' }, { vocab_item_id: 'v2' }], error: null },
      itemsResult: {
        data: [
          { id: 'v1', slug: 'hello', audio_url: 'a1', image_url: 'i1', homophone_group: null },
          { id: 'v2', slug: 'goodbye', audio_url: 'a2', image_url: 'i2', homophone_group: null },
        ],
        error: null,
      },
    })

    const result = await getVocabItemsForLevel(supabase, 1)
    expect(result).toEqual([
      { id: 'v1', slug: 'hello', audioUrl: 'a1', imageUrl: 'i1', homophoneGroup: null },
      { id: 'v2', slug: 'goodbye', audioUrl: 'a2', imageUrl: 'i2', homophoneGroup: null },
    ])
  })

  it('returns an empty array when the level has no vocab', async () => {
    const supabase = makeLevelVocabMock({ linksResult: { data: [], error: null } })
    const result = await getVocabItemsForLevel(supabase, 999)
    expect(result).toEqual([])
  })

  it('throws when the level_vocab query errors', async () => {
    const supabase = makeLevelVocabMock({ linksResult: { data: null, error: { message: 'boom' } } })
    await expect(getVocabItemsForLevel(supabase, 1)).rejects.toThrow(
      'Failed to fetch level_vocab for level 1: boom'
    )
  })

  it('throws when the vocab_items query errors', async () => {
    const supabase = makeLevelVocabMock({
      linksResult: { data: [{ vocab_item_id: 'v1' }], error: null },
      itemsResult: { data: null, error: { message: 'boom' } },
    })
    await expect(getVocabItemsForLevel(supabase, 1)).rejects.toThrow(
      'Failed to fetch vocab items for level 1: boom'
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- content.test.ts`
Expected: FAIL — `getVocabItemsForLevel` is not exported from `./content`.

- [ ] **Step 3: Add `getVocabItemsForLevel` to `src/lib/db/content.ts`**

Append to the end of `src/lib/db/content.ts`:

```ts
import type { VocabGameItem } from '../game/round'

export async function getVocabItemsForLevel(
  supabase: SupabaseClient,
  levelId: number
): Promise<VocabGameItem[]> {
  const { data: links, error: linksError } = await supabase
    .from('level_vocab')
    .select('vocab_item_id')
    .eq('level_id', levelId)

  if (linksError) {
    throw new Error(`Failed to fetch level_vocab for level ${levelId}: ${linksError.message}`)
  }

  const vocabItemIds = (links ?? []).map((link: { vocab_item_id: string }) => link.vocab_item_id)
  if (vocabItemIds.length === 0) {
    return []
  }

  const { data: items, error: itemsError } = await supabase
    .from('vocab_items')
    .select('id, slug, audio_url, image_url, homophone_group')
    .in('id', vocabItemIds)
    .order('created_at', { ascending: true })

  if (itemsError) {
    throw new Error(`Failed to fetch vocab items for level ${levelId}: ${itemsError.message}`)
  }

  return (items ?? []).map(
    (item: { id: string; slug: string; audio_url: string; image_url: string; homophone_group: string | null }) => ({
      id: item.id,
      slug: item.slug,
      audioUrl: item.audio_url,
      imageUrl: item.image_url,
      homophoneGroup: item.homophone_group,
    })
  )
}
```

Move the `import type { VocabGameItem } from '../game/round'` line up to the top of the file alongside the existing `import type { SupabaseClient } from '@supabase/supabase-js'` line — TypeScript allows imports anywhere at module top level, but keeping them together is clearer.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- content.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the level game page**

Create `src/app/play/[levelId]/page.test.tsx`:

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
vi.mock('@/lib/db/content', () => ({
  getVocabItemsForLevel: vi.fn(),
}))
vi.mock('./listen-tap-game', () => ({
  ListenTapGame: ({ levelName }: { levelName: string }) => <div>Playing {levelName}</div>,
}))

import LevelPage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { getVocabItemsForLevel } from '@/lib/db/content'
import { createSessionCookieValue } from '@/lib/auth/session'

function makeParams(levelId: string) {
  return Promise.resolve({ levelId })
}

describe('LevelPage', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    notFoundMock.mockClear()
  })

  it('calls notFound for an unknown level id', async () => {
    await expect(LevelPage({ params: makeParams('999') })).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('redirects to login when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    await expect(LevelPage({ params: makeParams('1') })).rejects.toThrow('REDIRECT:/login')
  })

  it('redirects to /play when the level is locked', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])

    await expect(LevelPage({ params: makeParams('2') })).rejects.toThrow('REDIRECT:/play')
  })

  it('renders the game when the level is unlocked', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getVocabItemsForLevel).mockResolvedValue([])

    render(await LevelPage({ params: makeParams('1') }))
    expect(screen.getByText('Playing Greetings')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- "app/play/[levelId]/page.test.tsx"`
Expected: FAIL — `./page` does not exist.

- [ ] **Step 7: Implement `src/app/play/[levelId]/page.tsx`**

```tsx
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { getVocabItemsForLevel } from '@/lib/db/content'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../content/vocab'
import { ListenTapGame } from './listen-tap-game'

export default async function LevelPage({ params }: { params: Promise<{ levelId: string }> }) {
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

  const vocabItems = await getVocabItemsForLevel(supabase, levelId)

  return <ListenTapGame levelId={levelId} levelName={level.name} vocabItems={vocabItems} />
}
```

- [ ] **Step 8: Create a minimal stub for `listen-tap-game.tsx`**

`vi.mock('./listen-tap-game', ...)` in the test replaces the module's contents, but Vitest's resolver still needs a real file to exist at that path before it will apply the mock. Create a placeholder that Task 5 will fully replace:

```tsx
import type { VocabGameItem } from '@/lib/game/round'

interface ListenTapGameProps {
  levelId: number
  levelName: string
  vocabItems: VocabGameItem[]
}

export function ListenTapGame(_props: ListenTapGameProps) {
  return null
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- "app/play/[levelId]/page.test.tsx"`
Expected: PASS (the test's `vi.mock('./listen-tap-game', ...)` replaces the stub's contents with a component that renders `levelName`)

- [ ] **Step 10: Commit**

```bash
git add src/lib/db/content.ts src/lib/db/content.test.ts src/app/play/[levelId]/page.tsx "src/app/play/[levelId]/page.test.tsx" "src/app/play/[levelId]/listen-tap-game.tsx"
git commit -m "feat: add vocab-for-level fetch and level game page"
```

---

## Task 5: ListenTapGame Client Component

**Files:**
- Create: `src/app/play/[levelId]/listen-tap-game.tsx`
- Test: `src/app/play/[levelId]/listen-tap-game.test.tsx`

**Interfaces:**
- Consumes: `VocabGameItem`, `buildRounds`, `pickDistractors` (`@/lib/game/round`).
- Produces: `ListenTapGame({ levelId, levelName, vocabItems }: { levelId: number; levelName: string; vocabItems: VocabGameItem[] })` React component from `./listen-tap-game` — consumed by Task 4's page.

- [ ] **Step 1: Write the failing tests**

Create `src/app/play/[levelId]/listen-tap-game.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VocabGameItem } from '@/lib/game/round'
import { ListenTapGame } from './listen-tap-game'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function makeItem(id: string): VocabGameItem {
  return {
    id,
    slug: id,
    audioUrl: `https://example.com/${id}.mp3`,
    imageUrl: `https://example.com/${id}.svg`,
    homophoneGroup: null,
  }
}

describe('ListenTapGame', () => {
  beforeEach(() => {
    pushMock.mockClear()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
  })

  it('advances to the next item after a correct first-try answer', async () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(screen.getByTestId('b')).toBeInTheDocument())
  })

  it('shows a retry message on a wrong answer and keeps the same item', async () => {
    const items = [makeItem('a'), makeItem('b')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('b'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again!')
    expect(screen.getByTestId('a')).toBeInTheDocument()
  })

  it('finishes a single-item level with 3 stars for a first-try correct answer', async () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(screen.getByText('Level complete!')).toBeInTheDocument())
    expect(screen.getByText('You earned 3 stars.')).toBeInTheDocument()
  })

  it('awards 1 star after a retry and sums correctly across items', async () => {
    const items = [makeItem('a'), makeItem('b')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('b'))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(screen.getByTestId('b')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('b'))

    await waitFor(() => expect(screen.getByText('You earned 4 stars.')).toBeInTheDocument())
  })

  it('saves progress via the API when the level finishes', async () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/progress',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ levelId: 1, starsEarned: 3, gameType: 'listen-tap' }),
        })
      )
    )
  })

  it('returns to the level list when "Back to levels" is clicked', async () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))
    await screen.findByText('Level complete!')

    fireEvent.click(screen.getByRole('button', { name: 'Back to levels' }))
    expect(pushMock).toHaveBeenCalledWith('/play')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- listen-tap-game.test.tsx`
Expected: FAIL — `./listen-tap-game` does not exist.

- [ ] **Step 3: Implement `src/app/play/[levelId]/listen-tap-game.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildRounds, pickDistractors, type VocabGameItem } from '@/lib/game/round'

const STARS_FIRST_TRY = 3
const STARS_AFTER_RETRY = 1

// A plain module-level function, not an inline call in the component body —
// React 19's react-hooks/purity lint rule flags Math.random() called
// directly during render, but not inside an ordinary function it calls.
function shuffleChoices(items: VocabGameItem[]): VocabGameItem[] {
  return [...items].sort(() => Math.random() - 0.5)
}

interface ListenTapGameProps {
  levelId: number
  levelName: string
  vocabItems: VocabGameItem[]
}

export function ListenTapGame({ levelId, levelName, vocabItems }: ListenTapGameProps) {
  const router = useRouter()
  const rounds = useMemo(() => buildRounds(vocabItems), [vocabItems])

  const [roundIndex, setRoundIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [starsEarned, setStarsEarned] = useState(0)
  const [hasMissed, setHasMissed] = useState(false)
  const [phase, setPhase] = useState<'playing' | 'saving' | 'summary'>('playing')
  const audioRef = useRef<HTMLAudioElement>(null)

  const currentRound = rounds[roundIndex]
  const currentItem = currentRound?.[itemIndex]

  // Derived during render via useMemo rather than an Effect + setState —
  // React 19's react-hooks/set-state-in-effect rule flags setState calls
  // made synchronously inside an Effect body when the value could instead
  // be computed directly from props/state during render.
  const choices = useMemo(() => {
    if (!currentItem) return []
    const distractors = pickDistractors(vocabItems, currentItem, 2)
    return shuffleChoices([currentItem, ...distractors])
  }, [currentItem, vocabItems])

  // Reset the "missed" flag whenever the question changes, following React's
  // documented pattern for adjusting state during render instead of an Effect.
  const [lastItemId, setLastItemId] = useState(currentItem?.id)
  if (currentItem?.id !== lastItemId) {
    setLastItemId(currentItem?.id)
    setHasMissed(false)
  }

  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [currentItem])

  async function finishLevel(finalStars: number) {
    setPhase('saving')
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'listen-tap' }),
    })
    setPhase('summary')
  }

  function handleChoice(choice: VocabGameItem) {
    if (!currentItem) return

    if (choice.id !== currentItem.id) {
      setHasMissed(true)
      return
    }

    const earned = hasMissed ? STARS_AFTER_RETRY : STARS_FIRST_TRY
    const newStars = starsEarned + earned

    const isLastItemInRound = itemIndex + 1 >= currentRound.length
    const isLastRound = roundIndex + 1 >= rounds.length

    setStarsEarned(newStars)

    if (isLastItemInRound && isLastRound) {
      finishLevel(newStars)
      return
    }

    if (isLastItemInRound) {
      setRoundIndex((value) => value + 1)
      setItemIndex(0)
    } else {
      setItemIndex((value) => value + 1)
    }
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

  if (!currentItem) {
    return <p>Loading...</p>
  }

  return (
    <main>
      <h1>{levelName}</h1>
      <p>
        Round {roundIndex + 1} of {rounds.length}
      </p>
      <audio ref={audioRef} src={currentItem.audioUrl} data-testid="prompt-audio" />
      <button onClick={() => audioRef.current?.play().catch(() => {})}>Play again</button>
      <div>
        {choices.map((choice) => (
          <button key={choice.id} data-testid={choice.id} onClick={() => handleChoice(choice)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small externally-hosted SVG icons, not a Next/Image optimization candidate */}
            <img src={choice.imageUrl} alt="" width={120} height={120} />
          </button>
        ))}
      </div>
      {hasMissed && <p role="alert">Try again!</p>}
    </main>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- listen-tap-game.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors (this also confirms Task 4's page test now exercises the real `ListenTapGame` import chain correctly, since the mock in that test file replaces this module).

- [ ] **Step 6: Commit**

```bash
git add "src/app/play/[levelId]/listen-tap-game.tsx" "src/app/play/[levelId]/listen-tap-game.test.tsx"
git commit -m "feat: add ListenTapGame client component"
```

---

## Task 6: Progress API Route

**Files:**
- Create: `src/app/api/progress/route.ts`
- Test: `src/app/api/progress/route.test.ts`

**Interfaces:**
- Consumes: `readSession` (`@/lib/auth/session`), `createSupabaseServerClient` (`@/lib/supabase/client`), `saveLevelProgress` (`@/lib/db/progress`).
- Produces: `POST /api/progress` accepting `{ levelId: number; starsEarned: number; gameType: string }` for the authenticated kid, returning `200 { ok: true }`, `401` if not logged in, `400` if fields are missing/malformed — consumed by Task 5's `ListenTapGame`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/progress/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSessionCookieValue, COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/progress', () => ({
  saveLevelProgress: vi.fn(),
}))

import { POST } from './route'
import { saveLevelProgress } from '@/lib/db/progress'

async function makeAuthenticatedRequest(body: unknown) {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
  return new NextRequest('http://localhost/api/progress', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${cookieValue}`,
    },
  })
}

describe('POST /api/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves progress for the authenticated kid', async () => {
    const request = await makeAuthenticatedRequest({ levelId: 1, starsEarned: 12, gameType: 'listen-tap' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(saveLevelProgress).toHaveBeenCalledWith(expect.anything(), 'kid-1', 1, 12, 'listen-tap')
  })

  it('rejects an unauthenticated request', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const request = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ levelId: 1, starsEarned: 12, gameType: 'listen-tap' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('rejects a request missing required fields', async () => {
    const request = await makeAuthenticatedRequest({ levelId: 1 })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/api/progress`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement `src/app/api/progress/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { readSession } from '@/lib/auth/session'
import { saveLevelProgress } from '@/lib/db/progress'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const levelId = typeof body?.levelId === 'number' ? body.levelId : null
  const starsEarned = typeof body?.starsEarned === 'number' ? body.starsEarned : null
  const gameType = typeof body?.gameType === 'string' ? body.gameType : null

  if (levelId === null || starsEarned === null || !gameType) {
    return NextResponse.json({ error: 'levelId, starsEarned, and gameType are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  await saveLevelProgress(supabase, session.kidId, levelId, starsEarned, gameType)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/api/progress`
Expected: PASS

- [ ] **Step 5: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. This is the last task in the plan, so this is the final full-project check.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/progress/route.ts src/app/api/progress/route.test.ts
git commit -m "feat: add progress API route"
```

---

## Plan Complete

At the end of this plan: a kid logs in, sees `/play` with Greetings unlocked and the other 3 levels locked, plays through Greetings' two rounds of 4 words each (hearing Cantonese audio, tapping the matching picture out of 3 choices, retrying gently on a miss), and on finishing sees their star total — which, if high enough, unlocks People & Family. This is the first plan where the app is actually playable end-to-end. It unblocks Plan 4 (Find-in-Scene & Memory Match games) and Plan 5 (Reward System), both of which build on the `progress` table and level-status logic established here.
