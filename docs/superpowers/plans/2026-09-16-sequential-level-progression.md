# Sequential Level Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cumulative-star level-unlock system with a sequential chain: completing a level's Listen & Tap unlocks that level's Find in the Scene (where one exists), and completing that unlocks the next level's Listen & Tap.

**Architecture:** `computeLevelStatus` is rewritten to derive `unlocked` and a new `sceneUnlocked` field from each level's already-tracked `completedGameTypes`, instead of from `unlockThreshold`. Every call site threads through which levels have scene content. No new database columns or localStorage fields.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-16-sequential-level-progression-design.md`

## Global Constraints

- No new database migration. The `unlock_threshold` column stays in place, unused (it is `not null default 0`).
- No changes to how stars are earned, saved, or displayed.
- No changes to Find-in-Scene or Listen & Tap gameplay mechanics.
- Every task must leave `npm test`, `npm run lint`, and `npm run build` green before its commit.

---

### Task 1: Remove `unlockThreshold` from the level data model

**Files:**
- Modify: `content/vocab.ts`
- Modify: `src/lib/db/content.ts`
- Modify: `src/lib/db/content.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `LevelSource` (in `content/vocab.ts`) without an `unlockThreshold` field — later tasks' `LEVELS` fixtures and code must not reference it.

- [ ] **Step 1: Remove `unlockThreshold` from `LevelSource` and `LEVELS`**

In `content/vocab.ts`, change:

```ts
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
  { id: 5, name: 'Colors', order: 5, unlockThreshold: 80 },
]
```

to:

```ts
export interface LevelSource {
  id: number
  name: string
  order: number
}

export const LEVELS: LevelSource[] = [
  { id: 1, name: 'Greetings', order: 1 },
  { id: 2, name: 'People & Family', order: 2 },
  { id: 3, name: 'Descriptors & Animals', order: 3 },
  { id: 4, name: 'Numbers', order: 4 },
  { id: 5, name: 'Colors', order: 5 },
]
```

- [ ] **Step 2: Update the failing test fixtures in `src/lib/db/content.test.ts`**

Change both occurrences of:

```ts
upsertLevel(supabase, { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 })
```

to:

```ts
upsertLevel(supabase, { id: 1, name: 'Greetings', order: 1 })
```

(one in the `'resolves when the upsert succeeds'` test, one in the `'throws when the upsert fails'` test.)

- [ ] **Step 3: Run the affected tests to see the real failure (TypeScript compile error, not a runtime assertion)**

Run: `npm test -- content.test.ts`
Expected: FAIL — `upsertLevel` in `src/lib/db/content.ts` still writes `unlock_threshold: level.unlockThreshold`, which now reads `undefined` since the type no longer has that field; the upsert mock doesn't care about the payload's contents, so this specific test file will actually still pass at runtime. The real failure is `npm run build`'s TypeScript check, since `upsertLevel`'s body still references `level.unlockThreshold`, a property that no longer exists on `LevelSource`.

Run: `npm run build`
Expected: FAIL with a TypeScript error on `level.unlockThreshold` in `src/lib/db/content.ts`.

- [ ] **Step 4: Remove `unlock_threshold` from the upsert payload**

In `src/lib/db/content.ts`, change:

```ts
export async function upsertLevel(supabase: SupabaseClient, level: LevelSource): Promise<void> {
  const { error } = await supabase
    .from('levels')
    .upsert({ id: level.id, name: level.name, order: level.order, unlock_threshold: level.unlockThreshold })

  if (error) {
    throw new Error(`Failed to upsert level ${level.id}: ${error.message}`)
  }
}
```

to:

```ts
export async function upsertLevel(supabase: SupabaseClient, level: LevelSource): Promise<void> {
  const { error } = await supabase
    .from('levels')
    .upsert({ id: level.id, name: level.name, order: level.order })

  if (error) {
    throw new Error(`Failed to upsert level ${level.id}: ${error.message}`)
  }
}
```

- [ ] **Step 5: Run the full suite and build to confirm green**

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add content/vocab.ts src/lib/db/content.ts src/lib/db/content.test.ts
git commit -m "refactor: remove star-threshold field from level data model"
```

---

### Task 2: Rewrite `computeLevelStatus` for sequential-completion unlocking

**Files:**
- Modify: `src/lib/game/level-status.ts`
- Modify: `src/lib/game/level-status.test.ts`

**Interfaces:**
- Consumes: `LevelSource` from `content/vocab.ts` (now without `unlockThreshold`, from Task 1), `ProgressRow` from `src/lib/db/progress.ts` (`{ levelId: number; starsEarned: number; completedGameTypes: string[] }`, unchanged).
- Produces: `LevelStatus` with a new `sceneUnlocked: boolean` field, and `computeLevelStatus(levels, progress, levelIdsWithScenes)` — a new required third parameter, `levelIdsWithScenes: Set<number>`. Later tasks (3, 4) rely on this exact signature and the `sceneUnlocked` field name.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/lib/game/level-status.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { computeLevelStatus } from './level-status'

const LEVELS = [
  { id: 1, name: 'Greetings', order: 1 },
  { id: 2, name: 'People & Family', order: 2 },
  { id: 3, name: 'Descriptors & Animals', order: 3 },
]

// Level 2 has scene content; levels 1 and 3 do not, for these tests.
const LEVEL_IDS_WITH_SCENES = new Set([2])

describe('computeLevelStatus', () => {
  it('always unlocks the first level', () => {
    const result = computeLevelStatus(LEVELS, [], LEVEL_IDS_WITH_SCENES)
    expect(result[0]).toMatchObject({ id: 1, unlocked: true, starsEarned: 0 })
  })

  it("locks the next level until the previous no-scene level's listen-tap is completed", () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 1, starsEarned: 10, completedGameTypes: [] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: false })
  })

  it('unlocks the next level once the previous no-scene level completes listen-tap', () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: true })
  })

  it('does not unlock the next level from listen-tap alone when the previous level has a scene', () => {
    const result = computeLevelStatus(
      LEVELS,
      [
        { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
        { levelId: 2, starsEarned: 3, completedGameTypes: ['listen-tap'] },
      ],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[2]).toMatchObject({ id: 3, unlocked: false })
  })

  it('unlocks the next level once the previous scene-having level completes find-scene', () => {
    const result = computeLevelStatus(
      LEVELS,
      [
        { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
        { levelId: 2, starsEarned: 6, completedGameTypes: ['listen-tap', 'find-scene'] },
      ],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[2]).toMatchObject({ id: 3, unlocked: true })
  })

  it('reports sceneUnlocked false for a scene-having level until its own listen-tap is completed', () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: true, sceneUnlocked: false })
  })

  it('reports sceneUnlocked true once a scene-having level completes its own listen-tap', () => {
    const result = computeLevelStatus(
      LEVELS,
      [
        { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
        { levelId: 2, starsEarned: 3, completedGameTypes: ['listen-tap'] },
      ],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, sceneUnlocked: true })
  })

  it('never unlocks a level whose own listen-tap has not happened, even with unrelated other progress', () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 3, starsEarned: 9, completedGameTypes: ['listen-tap'] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1]).toMatchObject({ id: 2, unlocked: false })
  })

  it("reports each level's own stars earned", () => {
    const result = computeLevelStatus(
      LEVELS,
      [{ levelId: 2, starsEarned: 15, completedGameTypes: [] }],
      LEVEL_IDS_WITH_SCENES
    )
    expect(result[1].starsEarned).toBe(15)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- level-status.test.ts`
Expected: FAIL — `computeLevelStatus` currently takes 2 arguments and computes `unlocked` from a removed `unlockThreshold` field, so this won't even type-check. You should see TypeScript/Vitest errors about the extra argument and about `sceneUnlocked` not existing on the returned objects.

- [ ] **Step 3: Rewrite `src/lib/game/level-status.ts`**

Replace its entire contents with:

```ts
import type { LevelSource } from '../../../content/vocab'
import type { ProgressRow } from '../db/progress'

export interface LevelStatus {
  id: number
  name: string
  order: number
  starsEarned: number
  unlocked: boolean
  sceneUnlocked: boolean
}

export function computeLevelStatus(
  levels: LevelSource[],
  progress: ProgressRow[],
  levelIdsWithScenes: Set<number>
): LevelStatus[] {
  const progressByLevel = new Map(progress.map((row) => [row.levelId, row]))
  const sortedLevels = [...levels].sort((a, b) => a.order - b.order)

  function terminalStepFor(levelId: number): string {
    return levelIdsWithScenes.has(levelId) ? 'find-scene' : 'listen-tap'
  }

  function hasCompleted(levelId: number, gameType: string): boolean {
    return progressByLevel.get(levelId)?.completedGameTypes.includes(gameType) ?? false
  }

  return sortedLevels.map((level, index) => {
    const previousLevel = sortedLevels[index - 1]
    const unlocked = index === 0 || hasCompleted(previousLevel.id, terminalStepFor(previousLevel.id))
    const sceneUnlocked = unlocked && hasCompleted(level.id, 'listen-tap')

    return {
      id: level.id,
      name: level.name,
      order: level.order,
      starsEarned: progressByLevel.get(level.id)?.starsEarned ?? 0,
      unlocked,
      sceneUnlocked,
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- level-status.test.ts`
Expected: all pass.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test`
Expected: other test files that call `computeLevelStatus` (e.g. `src/app/play/page.test.tsx`, `src/app/play/[levelId]/page.test.tsx`, `src/app/play/[levelId]/scene/page.test.tsx`, `src/lib/guest/use-guest-level-gate.test.tsx`) will now fail to compile because those call sites don't pass the new third argument yet. That's expected — Task 3 fixes them. Confirm the failures are all TypeScript "expected 3 arguments, got 2" errors (or similar) in those specific files, not something else.

Run: `npm run build`
Expected: FAILS for the same reason — this is expected at this point in the plan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/level-status.ts src/lib/game/level-status.test.ts
git commit -m "feat: derive level unlocking from sequential game-type completion"
```

(It's fine that `npm test` and `npm run build` are red across the whole repo after this commit — Task 3 fixes every remaining call site. Do not skip this commit; it keeps the algorithm change isolated from the call-site wiring for review.)

---

### Task 3: Update `LockedLevelCard` copy

**Files:**
- Modify: `src/components/ui/locked-level-card.tsx`
- Modify: `src/components/ui/locked-level-card.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `LockedLevelCard({ name: string })` — the `unlockThreshold` prop is removed. Task 4 renders this component with only a `name` prop.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/components/ui/locked-level-card.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LockedLevelCard } from './locked-level-card'

describe('LockedLevelCard', () => {
  it('shows the level name and a locked message as one continuous text run', () => {
    render(<LockedLevelCard name="Numbers" />)
    expect(screen.getByText(/Numbers — locked — finish the previous level first/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- locked-level-card.test.tsx`
Expected: FAIL — the current component renders `"Numbers — locked"` with no further text (since no `unlockThreshold` prop is passed), not `"Numbers — locked — finish the previous level first"`.

- [ ] **Step 3: Update the component**

Replace the entire contents of `src/components/ui/locked-level-card.tsx` with:

```tsx
import { Card } from './card'

interface LockedLevelCardProps {
  name: string
}

export function LockedLevelCard({ name }: LockedLevelCardProps) {
  return (
    <Card muted>
      <span className="font-bold text-gray-500">🔒 {name} — locked — finish the previous level first</span>
    </Card>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- locked-level-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/locked-level-card.tsx src/components/ui/locked-level-card.test.tsx
git commit -m "feat: replace star-threshold copy on locked level cards"
```

---

### Task 4: Update `LevelList` for per-level scene gating

**Files:**
- Modify: `src/components/level-list.tsx`
- Modify: `src/components/level-list.test.tsx`

**Interfaces:**
- Consumes: `LevelStatus` with `sceneUnlocked: boolean` (Task 2); `LockedLevelCard({ name })` without `unlockThreshold` (Task 3); existing `Button` and `LinkButton` from `src/components/ui/button.tsx` (`Button` accepts a `disabled` prop, both accept `variant: 'primary' | 'secondary'`).
- Produces: no exports other tasks depend on — `LevelList` is a leaf UI component in this plan.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/components/level-list.test.tsx` with:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LevelList } from './level-list'
import type { LevelStatus } from '@/lib/game/level-status'

describe('LevelList', () => {
  it('shows unlocked levels with a Listen & Tap link and locked levels as a locked card', () => {
    const levels: LevelStatus[] = [
      { id: 1, name: 'Greetings', order: 1, starsEarned: 10, unlocked: true, sceneUnlocked: false },
      { id: 2, name: 'People & Family', order: 2, starsEarned: 0, unlocked: false, sceneUnlocked: false },
    ]
    render(<LevelList levels={levels} />)

    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    // Level 1 (Greetings) has 8 vocab items, so its max is 8 * 3 = 24 stars.
    expect(within(greetingsItem as HTMLElement).getByText('10 / 24 stars')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute('href', '/play/1')
    expect(screen.getByText(/People & Family — locked — finish the previous level first/)).toBeInTheDocument()
  })

  it('shows no Find in the Scene link or button for levels with no scene content', () => {
    const levels: LevelStatus[] = [
      { id: 1, name: 'Greetings', order: 1, starsEarned: 200, unlocked: true, sceneUnlocked: true },
    ]
    render(<LevelList levels={levels} />)

    // Level 1 (Greetings) has no scene content, so nothing scene-related
    // renders even though it (and sceneUnlocked) is true.
    expect(screen.queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })

  it('shows an enabled Find in the Scene link when the scene is unlocked', () => {
    const levels: LevelStatus[] = [
      { id: 2, name: 'People & Family', order: 2, starsEarned: 12, unlocked: true, sceneUnlocked: true },
    ]
    render(<LevelList levels={levels} />)

    // Level 2 (People & Family) has scene content.
    expect(screen.getByRole('link', { name: 'Find in the Scene' })).toHaveAttribute('href', '/play/2/scene')
  })

  it('shows a disabled Find in the Scene button with a hint when the scene is locked', () => {
    const levels: LevelStatus[] = [
      { id: 2, name: 'People & Family', order: 2, starsEarned: 0, unlocked: true, sceneUnlocked: false },
    ]
    render(<LevelList levels={levels} />)

    expect(screen.getByRole('button', { name: 'Find in the Scene' })).toBeDisabled()
    expect(screen.getByText('Finish Listen & Tap first')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- level-list.test.tsx`
Expected: FAIL — the current component doesn't type-check against `LevelStatus` fixtures missing `sceneUnlocked`... actually the fixtures above already include `sceneUnlocked`, so the type-check passes; the failures will be runtime assertion failures: the current `LevelList` always renders an enabled `LinkButton` for "Find in the Scene" whenever the level has scene content, regardless of `sceneUnlocked`, so the "disabled button" test fails (no `button` role element exists yet), and `LockedLevelCard` is called with an `unlockThreshold` prop it no longer accepts (harmless extra prop, but the locked-card text assertion in the first test will fail since the component doesn't yet produce the new copy... actually `LockedLevelCard` itself was already fixed in Task 3, so that part passes. The scene-button tests are what fail here).

- [ ] **Step 3: Update `src/components/level-list.tsx`**

Replace its entire contents with:

```tsx
import type { LevelStatus } from '@/lib/game/level-status'
import { Card } from '@/components/ui/card'
import { LockedLevelCard } from '@/components/ui/locked-level-card'
import { StarRating } from '@/components/ui/star-rating'
import { LinkButton, Button } from '@/components/ui/button'
import { VOCAB_ITEMS } from '../../content/vocab'
import { SCENES } from '../../content/scenes'

const STARS_PER_ITEM = 3

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

const MAX_STARS_BY_LEVEL = new Map<number, number>()
for (const item of VOCAB_ITEMS) {
  MAX_STARS_BY_LEVEL.set(item.level, (MAX_STARS_BY_LEVEL.get(item.level) ?? 0) + STARS_PER_ITEM)
}

interface LevelListProps {
  levels: LevelStatus[]
}

export function LevelList({ levels }: LevelListProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {levels.map((level) => (
        <li key={level.id}>
          {level.unlocked ? (
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xl font-extrabold text-brand-ink">{level.name} —</span>
                <StarRating stars={level.starsEarned} maxStars={MAX_STARS_BY_LEVEL.get(level.id)} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <LinkButton href={`/play/${level.id}`} variant="primary">
                  Listen &amp; Tap
                </LinkButton>
                {LEVEL_IDS_WITH_SCENES.has(level.id) &&
                  (level.sceneUnlocked ? (
                    <LinkButton href={`/play/${level.id}/scene`} variant="secondary">
                      Find in the Scene
                    </LinkButton>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Button variant="secondary" disabled>
                        Find in the Scene
                      </Button>
                      <span className="text-sm text-gray-500">Finish Listen &amp; Tap first</span>
                    </span>
                  ))}
              </div>
            </Card>
          ) : (
            <LockedLevelCard name={level.name} />
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- level-list.test.tsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/level-list.tsx src/components/level-list.test.tsx
git commit -m "feat: gate the Find in the Scene button on its own level's completion"
```

---

### Task 5: Wire the new `computeLevelStatus` signature through every call site

**Files:**
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.tsx`
- Modify: `src/app/guest-play-page.tsx`
- Modify: `src/app/play/[levelId]/page.tsx`
- Modify: `src/app/play/[levelId]/scene/page.tsx`
- Modify: `src/app/play/[levelId]/scene/page.test.tsx`
- Modify: `src/lib/guest/use-guest-level-gate.ts`
- Modify: `src/lib/guest/use-guest-level-gate.test.tsx`

**Interfaces:**
- Consumes: `computeLevelStatus(levels, progress, levelIdsWithScenes)` and `LevelStatus.sceneUnlocked` (Task 2).
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Update `src/app/play/page.tsx`**

Change:

```ts
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
```

to:

```ts
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { SCENES } from '../../../content/scenes'
```

and change:

```ts
  const levels = computeLevelStatus(LEVELS, progress)
```

to:

```ts
  const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
  const levels = computeLevelStatus(LEVELS, progress, levelIdsWithScenes)
```

- [ ] **Step 2: Update `src/app/guest-play-page.tsx`**

Change:

```ts
import { computeLevelStatus, type LevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../content/vocab'
```

to:

```ts
import { computeLevelStatus, type LevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../content/vocab'
import { SCENES } from '../../content/scenes'
```

and change:

```ts
    setLevels(computeLevelStatus(LEVELS, getGuestProgress()))
```

to:

```ts
    const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
    setLevels(computeLevelStatus(LEVELS, getGuestProgress(), levelIdsWithScenes))
```

- [ ] **Step 3: Update `src/app/play/[levelId]/page.tsx`**

Change:

```ts
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../content/vocab'
```

to:

```ts
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../content/vocab'
import { SCENES } from '../../../../content/scenes'
```

and change:

```ts
  const progress = await getProgressForKid(supabase, session.kidId)
  const statuses = computeLevelStatus(LEVELS, progress)
  const status = statuses.find((candidate) => candidate.id === levelId)

  if (!status?.unlocked) {
    redirect('/play')
  }
```

to:

```ts
  const progress = await getProgressForKid(supabase, session.kidId)
  const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
  const statuses = computeLevelStatus(LEVELS, progress, levelIdsWithScenes)
  const status = statuses.find((candidate) => candidate.id === levelId)

  if (!status?.unlocked) {
    redirect('/play')
  }
```

- [ ] **Step 4: Update `src/app/play/[levelId]/scene/page.tsx`**

Change:

```ts
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../../content/vocab'
```

to:

```ts
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../../content/vocab'
import { SCENES } from '../../../../../content/scenes'
```

and change:

```ts
  const progress = await getProgressForKid(supabase, session.kidId)
  const statuses = computeLevelStatus(LEVELS, progress)
  const status = statuses.find((candidate) => candidate.id === levelId)

  if (!status?.unlocked) {
    redirect('/play')
  }
```

to:

```ts
  const progress = await getProgressForKid(supabase, session.kidId)
  const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
  const statuses = computeLevelStatus(LEVELS, progress, levelIdsWithScenes)
  const status = statuses.find((candidate) => candidate.id === levelId)

  if (!status?.sceneUnlocked) {
    redirect('/play')
  }
```

(Note the gate itself changes from `status?.unlocked` to `status?.sceneUnlocked` — this is the one behavioral change in this task; every other edit in this task is purely wiring the new parameter through.)

- [ ] **Step 5: Update `src/lib/guest/use-guest-level-gate.ts`**

Replace its entire contents with:

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getGuestProgress, saveGuestLevelProgress } from './progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { SCENES } from '../../../content/scenes'

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

export function useGuestLevelGate(levelId: number, gameType: string) {
  const router = useRouter()
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    const progress = getGuestProgress()
    const levels = computeLevelStatus(LEVELS, progress, LEVEL_IDS_WITH_SCENES)
    const level = levels.find((candidate) => candidate.id === levelId)
    const reachable = gameType === 'find-scene' ? level?.sceneUnlocked : level?.unlocked

    if (reachable) {
      // Reading localStorage can only happen client-side, so this can't be
      // computed during the initial (server-rendered) render without a
      // hydration mismatch — it genuinely needs to run post-mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnlocked(true)
    } else {
      router.push('/play')
    }
  }, [levelId, gameType, router])

  const onLevelComplete = useCallback(
    (starsEarned: number) => {
      saveGuestLevelProgress(levelId, starsEarned, gameType)
    },
    [levelId, gameType]
  )

  return { unlocked, onLevelComplete }
}
```

(`gameType` is now a dependency of the effect since the branch reads it — it was always a stable prop from the caller, so this doesn't change behavior beyond correctness.)

- [ ] **Step 6: Update `src/app/play/page.test.tsx`**

In the `'shows unlocked levels with a Listen & Tap link and locked levels as plain text'` test, change:

```ts
    // Level 2 (People & Family) has an unlockThreshold of 20.
    expect(screen.getByText(/People & Family — locked \(unlocks at 20 stars\)/)).toBeInTheDocument()
```

to:

```ts
    expect(screen.getByText(/People & Family — locked — finish the previous level first/)).toBeInTheDocument()
```

In the `'shows a Find in the Scene link only for unlocked levels that have scenes'` test, change the comment above the assertion from:

```ts
    // Level 1 (Greetings) has no scene content, so its list item gets no
    // scene link even though it (and every other level) is unlocked.
```

to:

```ts
    // Level 1 (Greetings) has no scene content, so its list item gets no
    // scene link regardless of unlock state.
```

(No other change needed in this test — the assertion itself only checks level 1's own list item, which has no scene content either way.)

- [ ] **Step 7: Update `src/app/play/[levelId]/scene/page.test.tsx`**

Two tests use level id `'1'` (Greetings, no scene content) with an empty progress array as a stand-in for "some unlocked level" — but level 1's `sceneUnlocked` requires its own `listen-tap` to be complete, which an empty progress array does not satisfy. Update both to supply that completion.

Change the `'calls notFound when the unlocked level has no scenes'` test from:

```ts
  it('calls notFound when the unlocked level has no scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getScenesForLevel).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('1') })).rejects.toThrow('NOT_FOUND')
  })
```

to:

```ts
  it('calls notFound when the unlocked level has no scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    // Level 1 has no scene content; completing its own listen-tap satisfies
    // sceneUnlocked so the test reaches the "no scenes" check in the page.
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
    ])
    vi.mocked(getScenesForLevel).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('1') })).rejects.toThrow('NOT_FOUND')
  })
```

Change the `'renders the scene game when the level is unlocked and has scenes'` test from:

```ts
  it('renders the scene game when the level is unlocked and has scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([])
    vi.mocked(getScenesForLevel).mockResolvedValue([{ id: 1, imageUrl: 'https://example.com/s.png', objects: [] }])

    render(await ScenePage({ params: makeParams('1') }))
    expect(screen.getByText('Playing scene: Greetings (logout shown)')).toBeInTheDocument()
  })
```

to:

```ts
  it('renders the scene game when the level is unlocked and has scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 3, completedGameTypes: ['listen-tap'] },
    ])
    vi.mocked(getScenesForLevel).mockResolvedValue([{ id: 1, imageUrl: 'https://example.com/s.png', objects: [] }])

    render(await ScenePage({ params: makeParams('1') }))
    expect(screen.getByText('Playing scene: Greetings (logout shown)')).toBeInTheDocument()
  })
```

Leave `'redirects to /play when the level is locked'` (uses level id `'3'` with empty progress) unchanged — level 3 has scene content and requires level 2's `find-scene` completion to unlock at all, so it's still correctly locked with empty progress.

- [ ] **Step 8: Add new tests to `src/lib/guest/use-guest-level-gate.test.tsx`**

Update the existing comments (they reference the removed `unlockThreshold`) and add two new tests for the `sceneUnlocked` branch. Replace the entire contents of the file with:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { useGuestLevelGate } from './use-guest-level-gate'
import { saveGuestLevelProgress } from './progress'

describe('useGuestLevelGate', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
  })

  it('reports unlocked and provides a working save callback when the level is unlocked', async () => {
    // Level 1 (Greetings) is always unlocked — it's first in the chain.
    const { result } = renderHook(() => useGuestLevelGate(1, 'listen-tap'))

    await waitFor(() => expect(result.current.unlocked).toBe(true))

    act(() => {
      result.current.onLevelComplete(12)
    })

    expect(window.localStorage.getItem('canto-guest-progress')).toContain('"levelId":1')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('redirects to /play when the level is locked', async () => {
    // Level 2 (People & Family) unlocks only once level 1's listen-tap is
    // completed; with no guest progress stored, it's locked.
    const { result } = renderHook(() => useGuestLevelGate(2, 'listen-tap'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
    expect(result.current.unlocked).toBe(false)
  })

  it('redirects to /play for find-scene when the level itself is unlocked but its own listen-tap is not done', async () => {
    // Level 2 has scene content. Unlocking level 2 (via level 1's
    // listen-tap) is not enough for find-scene — level 2's own listen-tap
    // must also be completed first.
    saveGuestLevelProgress(1, 3, 'listen-tap')

    const { result } = renderHook(() => useGuestLevelGate(2, 'find-scene'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
    expect(result.current.unlocked).toBe(false)
  })

  it('reports unlocked for find-scene once the level completes its own listen-tap', async () => {
    saveGuestLevelProgress(1, 3, 'listen-tap')
    saveGuestLevelProgress(2, 3, 'listen-tap')

    const { result } = renderHook(() => useGuestLevelGate(2, 'find-scene'))

    await waitFor(() => expect(result.current.unlocked).toBe(true))
    expect(pushMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Run lint and build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git add src/app/play/page.tsx src/app/play/page.test.tsx src/app/guest-play-page.tsx "src/app/play/[levelId]/page.tsx" "src/app/play/[levelId]/scene/page.tsx" "src/app/play/[levelId]/scene/page.test.tsx" src/lib/guest/use-guest-level-gate.ts src/lib/guest/use-guest-level-gate.test.tsx
git commit -m "feat: wire sequential level-unlock gating through every entry point"
```

---

## Final Verification

After Task 5, do a full manual sanity pass:

- [ ] Run `npm test`, `npm run lint`, `npm run build` one more time — all green.
- [ ] Start the dev server (`npm run dev`) and manually click through as a guest: Level 1's "Find in the Scene" should never appear (no scene content); Level 2 should be locked until Level 1's Listen & Tap is finished; once Level 2 unlocks, its "Find in the Scene" button should be visibly disabled with the "Finish Listen & Tap first" hint until Level 2's own Listen & Tap is completed.
