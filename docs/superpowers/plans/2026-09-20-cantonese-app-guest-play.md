# Guest Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a kid play Canto immediately with no account, by default — guest progress lives in `localStorage`, and `/play`, `/play/[levelId]`, and `/play/[levelId]/scene` serve both guests and named accounts at the same URLs.

**Architecture:** Each of the three currently session-gated pages gets exactly one new branch for the no-session case; their existing session-present branch is untouched. The new branch renders a Client Component that reads/writes progress via `localStorage` (mirroring the existing DB-backed `ProgressRow`/`computeLevelStatus` shapes exactly, so no game-logic code needs to know about "guest" as a concept) instead of redirecting to `/login`.

**Tech Stack:** Next.js 16.3.5 (App Router), React 19.3.0, TypeScript, Vitest 5 + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-20-cantonese-app-guest-play-design.md`

## Global Constraints

- Guest progress is `localStorage`-only — no Supabase row, no network call, for guests.
- Guest and named-account progress are two fully independent tracks; no conversion/import between them.
- One URL structure for everyone: no separate `/guest/*` route namespace.
- The **named-account (session-present) branch of every existing gated page must keep behaving exactly as it does today.** Every existing test for `ListenTapGame`, `SceneGame`, `LevelList`'s predecessor markup, and the session-present branches of the three page tests must keep passing. The only test changes in this plan are the three "redirects to login when there is no session" tests (one per gated page) — those assertions describe the exact behavior this feature intentionally replaces, so each becomes a "renders the guest experience instead" test in the task that changes that behavior. Do not change any other existing test.
- Reuse the existing `ProgressRow` type (`src/lib/db/progress.ts`) for guest progress rather than inventing a parallel type.

---

### Task 1: Guest progress storage

**Files:**
- Create: `src/lib/guest/progress.ts`
- Test: `src/lib/guest/progress.test.ts`

**Interfaces:**
- Consumes: `ProgressRow` type from `src/lib/db/progress.ts` (`{ levelId: number, starsEarned: number, completedGameTypes: string[] }`).
- Produces: `getGuestProgress(): ProgressRow[]`, `saveGuestLevelProgress(levelId: number, starsEarned: number, gameType: string): ProgressRow[]` — consumed by Tasks 2 and 4.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/guest/progress.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getGuestProgress, saveGuestLevelProgress } from './progress'

describe('getGuestProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns an empty array when nothing is stored', () => {
    expect(getGuestProgress()).toEqual([])
  })

  it('returns previously saved progress', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(getGuestProgress()).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('returns an empty array for unparseable stored data', () => {
    window.localStorage.setItem('canto-guest-progress', 'not json')
    expect(getGuestProgress()).toEqual([])
  })
})

describe('saveGuestLevelProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('creates a new progress row when none exists', () => {
    const result = saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('keeps the higher star total on replay', () => {
    saveGuestLevelProgress(1, 20, 'listen-tap')
    const result = saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 20, completedGameTypes: ['listen-tap'] }])
  })

  it('replaces a lower star total with a new best', () => {
    saveGuestLevelProgress(1, 5, 'listen-tap')
    const result = saveGuestLevelProgress(1, 18, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 18, completedGameTypes: ['listen-tap'] }])
  })

  it('adds a new game type without duplicating existing ones', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    const result = saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(result).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('adds a second game type for the same level', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    const result = saveGuestLevelProgress(1, 9, 'find-scene')
    expect(result).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap', 'find-scene'] }])
  })

  it('persists across calls to getGuestProgress', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    expect(getGuestProgress()).toEqual([{ levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] }])
  })

  it('tracks separate levels independently', () => {
    saveGuestLevelProgress(1, 12, 'listen-tap')
    const result = saveGuestLevelProgress(2, 6, 'listen-tap')
    expect(result).toEqual([
      { levelId: 1, starsEarned: 12, completedGameTypes: ['listen-tap'] },
      { levelId: 2, starsEarned: 6, completedGameTypes: ['listen-tap'] },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/guest/progress`
Expected: FAIL — `src/lib/guest/progress.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/guest/progress.ts`**

```ts
import type { ProgressRow } from '@/lib/db/progress'

const STORAGE_KEY = 'canto-guest-progress'

export function getGuestProgress(): ProgressRow[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGuestLevelProgress(levelId: number, starsEarned: number, gameType: string): ProgressRow[] {
  const progress = getGuestProgress()
  const existing = progress.find((row) => row.levelId === levelId)

  const bestStars = Math.max(existing?.starsEarned ?? 0, starsEarned)
  const existingGameTypes = existing?.completedGameTypes ?? []
  const completedGameTypes = existingGameTypes.includes(gameType)
    ? existingGameTypes
    : [...existingGameTypes, gameType]

  const updatedRow: ProgressRow = { levelId, starsEarned: bestStars, completedGameTypes }
  const updatedProgress = existing
    ? progress.map((row) => (row.levelId === levelId ? updatedRow : row))
    : [...progress, updatedRow]

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProgress))
  }

  return updatedProgress
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/guest/progress`
Expected: PASS (10 tests)

- [ ] **Step 5: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/guest/progress.ts src/lib/guest/progress.test.ts
git commit -m "feat: add localStorage-backed guest progress storage"
```

---

### Task 2: GuestLevelGate component

**Files:**
- Create: `src/components/guest-level-gate.tsx`
- Test: `src/components/guest-level-gate.test.tsx`

**Interfaces:**
- Consumes: `getGuestProgress`, `saveGuestLevelProgress` (Task 1); `computeLevelStatus` from `src/lib/game/level-status.ts`; `LEVELS` from `content/vocab.ts`.
- Produces: `GuestLevelGate({ levelId: number, gameType: string, children: (onLevelComplete: (starsEarned: number) => void) => React.ReactNode }): JSX.Element` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the failing tests**

Create `src/components/guest-level-gate.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { GuestLevelGate } from './guest-level-gate'

describe('GuestLevelGate', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
  })

  it('renders children with a working save callback when the level is unlocked', async () => {
    // Level 1 (Greetings) has an unlockThreshold of 0, so it's always unlocked.
    render(
      <GuestLevelGate levelId={1} gameType="listen-tap">
        {(onLevelComplete) => <button onClick={() => onLevelComplete(12)}>Finish</button>}
      </GuestLevelGate>
    )

    await waitFor(() => expect(screen.getByText('Finish')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Finish'))

    expect(window.localStorage.getItem('canto-guest-progress')).toContain('"levelId":1')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('redirects to /play when the level is locked', async () => {
    // Level 2 (People & Family) has an unlockThreshold of 20; with no guest
    // progress stored, total stars is 0, so it's locked.
    render(
      <GuestLevelGate levelId={2} gameType="listen-tap">
        {() => <p>Should not render</p>}
      </GuestLevelGate>
    )

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
    expect(screen.queryByText('Should not render')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- guest-level-gate`
Expected: FAIL — `src/components/guest-level-gate.tsx` does not exist yet.

- [ ] **Step 3: Implement `src/components/guest-level-gate.tsx`**

```tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getGuestProgress, saveGuestLevelProgress } from '@/lib/guest/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../content/vocab'

interface GuestLevelGateProps {
  levelId: number
  gameType: string
  children: (onLevelComplete: (starsEarned: number) => void) => ReactNode
}

export function GuestLevelGate({ levelId, gameType, children }: GuestLevelGateProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'checking' | 'unlocked'>('checking')

  useEffect(() => {
    const progress = getGuestProgress()
    const levels = computeLevelStatus(LEVELS, progress)
    const level = levels.find((candidate) => candidate.id === levelId)

    if (level?.unlocked) {
      setStatus('unlocked')
    } else {
      router.push('/play')
    }
  }, [levelId, router])

  if (status !== 'unlocked') {
    return <p>Loading...</p>
  }

  return <>{children((starsEarned) => saveGuestLevelProgress(levelId, starsEarned, gameType))}</>
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- guest-level-gate`
Expected: PASS (2 tests)

- [ ] **Step 5: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/guest-level-gate.tsx src/components/guest-level-gate.test.tsx
git commit -m "feat: add GuestLevelGate for client-side guest unlock checks"
```

---

### Task 3: Extract LevelList and rewire the named-account level-select page

**Files:**
- Create: `src/components/level-list.tsx`
- Test: `src/components/level-list.test.tsx`
- Modify: `src/app/play/page.tsx`

**Interfaces:**
- Consumes: `LevelStatus` type from `src/lib/game/level-status.ts`; `Card`, `LockedLevelCard`, `StarRating`, `LinkButton` from `src/components/ui/*`; `SCENES` from `content/scenes.ts`.
- Produces: `LevelList({ levels: LevelStatus[] }): JSX.Element` — consumed by Task 4 (`GuestPlayPage`) and this task's rewired `play/page.tsx`.

**This task is a pure refactor with no behavior change for named accounts** — it only extracts existing markup from `play/page.tsx` into a standalone component and re-renders it identically. The existing `play/page.test.tsx` (all 3 tests, including "redirects to login when there is no session") must keep passing completely unmodified after this task; that specific test only changes in Task 4.

- [ ] **Step 1: Read the current `play/page.tsx`**

Read `src/app/play/page.tsx` to confirm it matches the version below before editing.

- [ ] **Step 2: Write the failing tests for `LevelList`**

Create `src/components/level-list.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LevelList } from './level-list'
import type { LevelStatus } from '@/lib/game/level-status'

describe('LevelList', () => {
  it('shows unlocked levels with a Listen & Tap link and locked levels as plain text', () => {
    const levels: LevelStatus[] = [
      { id: 1, name: 'Greetings', order: 1, starsEarned: 10, unlocked: true },
      { id: 2, name: 'People & Family', order: 2, starsEarned: 0, unlocked: false },
    ]
    render(<LevelList levels={levels} />)

    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    expect(within(greetingsItem as HTMLElement).getByText('10 stars')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute('href', '/play/1')
    expect(screen.getByText(/People & Family — locked/)).toBeInTheDocument()
  })

  it('shows a Find in the Scene link only for levels that have scene content', () => {
    const levels: LevelStatus[] = [{ id: 1, name: 'Greetings', order: 1, starsEarned: 200, unlocked: true }]
    render(<LevelList levels={levels} />)

    // Level 1 (Greetings) has no scene content, so no scene link even though unlocked.
    expect(screen.queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- level-list.test`
Expected: FAIL — `src/components/level-list.tsx` does not exist yet.

- [ ] **Step 4: Implement `src/components/level-list.tsx`**

```tsx
import type { LevelStatus } from '@/lib/game/level-status'
import { Card } from '@/components/ui/card'
import { LockedLevelCard } from '@/components/ui/locked-level-card'
import { StarRating } from '@/components/ui/star-rating'
import { LinkButton } from '@/components/ui/button'
import { SCENES } from '../../content/scenes'

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

interface LevelListProps {
  levels: LevelStatus[]
}

export function LevelList({ levels }: LevelListProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {levels.map((level) => (
        <li key={level.id}>
          {level.unlocked ? (
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xl font-extrabold text-brand-ink">{level.name} —</span>
                <StarRating stars={level.starsEarned} />
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                <LinkButton href={`/play/${level.id}`} variant="primary">
                  Listen &amp; Tap
                </LinkButton>
                {LEVEL_IDS_WITH_SCENES.has(level.id) && (
                  <LinkButton href={`/play/${level.id}/scene`} variant="secondary">
                    Find in the Scene
                  </LinkButton>
                )}
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- level-list.test`
Expected: PASS (2 tests)

- [ ] **Step 6: Rewire `play/page.tsx` to use `LevelList`**

Replace the full contents of `src/app/play/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { Header } from '@/components/ui/header'
import { LevelList } from '@/components/level-list'

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
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        <LevelList levels={levels} />
      </main>
    </div>
  )
}
```

(The `redirect('/login')` line is intentionally still here — it's only replaced in Task 4.)

- [ ] **Step 7: Run the existing play/page tests to confirm they still pass unmodified**

Run: `npm test -- play/page.test`
Expected: PASS (3 tests, unmodified)

- [ ] **Step 8: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/level-list.tsx src/components/level-list.test.tsx src/app/play/page.tsx
git commit -m "refactor: extract LevelList from the level-select page"
```

---

### Task 4: GuestPlayPage and the level-select page's guest branch

**Files:**
- Create: `src/app/guest-play-page.tsx`
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.tsx`

**Interfaces:**
- Consumes: `getGuestProgress` (Task 1); `computeLevelStatus`, `LevelStatus` from `src/lib/game/level-status.ts`; `LEVELS` from `content/vocab.ts`; `Header` from `src/components/ui/header.tsx`; `LevelList` (Task 3).
- Produces: `GuestPlayPage(): JSX.Element` — consumed by this task's rewired `play/page.tsx`.

**Why `play/page.test.tsx` changes here:** its "redirects to login when there is no session" test asserts exactly the behavior this feature replaces — visiting `/play` with no session should now render the guest experience, not redirect to `/login`. This is the first of the plan's three anticipated, intentional test replacements (see Global Constraints). No other test in this file changes.

- [ ] **Step 1: Write `src/app/guest-play-page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getGuestProgress } from '@/lib/guest/progress'
import { computeLevelStatus, type LevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../content/vocab'
import { Header } from '@/components/ui/header'
import { LevelList } from '@/components/level-list'

export function GuestPlayPage() {
  const [levels, setLevels] = useState<LevelStatus[] | null>(null)

  useEffect(() => {
    setLevels(computeLevelStatus(LEVELS, getGuestProgress()))
  }, [])

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        {levels ? <LevelList levels={levels} /> : <p>Loading...</p>}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Update the failing test expectations in `play/page.test.tsx`**

Read `src/app/play/page.test.tsx` first, then replace its `'redirects to login when there is no session'` test:

```tsx
  it('redirects to login when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    await expect(PlayPage()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })
```

with:

```tsx
  it('renders the guest play page when there is no session, without redirecting to login', async () => {
    getMock.mockReturnValue(undefined)
    render(await PlayPage())
    expect(screen.getByText('Choose a level')).toBeInTheDocument()
    expect(redirectMock).not.toHaveBeenCalled()
  })
```

(The other two tests in this file — the unlocked-levels test and the Find-in-the-Scene test — are untouched.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- play/page.test`
Expected: FAIL — `PlayPage` still calls `redirect('/login')` when there's no session, so `render(await PlayPage())` throws instead of rendering.

- [ ] **Step 4: Rewire `play/page.tsx`'s no-session branch**

Replace the full contents of `src/app/play/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { Header } from '@/components/ui/header'
import { LevelList } from '@/components/level-list'
import { GuestPlayPage } from '../guest-play-page'

export default async function PlayPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)

  if (!session) {
    return <GuestPlayPage />
  }

  const supabase = createSupabaseServerClient()
  const progress = await getProgressForKid(supabase, session.kidId)
  const levels = computeLevelStatus(LEVELS, progress)

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        <LevelList levels={levels} />
      </main>
    </div>
  )
}
```

Note `redirect` is no longer imported — it's no longer used anywhere in this file.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- play/page.test`
Expected: PASS (3 tests)

- [ ] **Step 6: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/guest-play-page.tsx src/app/play/page.tsx src/app/play/page.test.tsx
git commit -m "feat: add guest play page and serve it from /play when there is no session"
```

---

### Task 5: Injectable progress-saving in ListenTapGame and SceneGame

**Files:**
- Modify: `src/app/play/[levelId]/listen-tap-game.tsx`
- Modify: `src/app/play/[levelId]/listen-tap-game.test.tsx`
- Modify: `src/app/play/[levelId]/scene/scene-game.tsx`
- Modify: `src/app/play/[levelId]/scene/scene-game.test.tsx`

**Interfaces:**
- Produces: both components gain an optional prop `onLevelComplete?: (starsEarned: number) => Promise<void> | void`, consumed by Tasks 6 and 7 via `GuestLevelGate`'s render-prop callback.

**This task only adds new tests — no existing test in either file changes.** Both components default to today's `POST /api/progress` behavior when `onLevelComplete` isn't passed, so every existing caller and every existing test (which never passes this new prop) is unaffected.

- [ ] **Step 1: Read the current files**

Read `src/app/play/[levelId]/listen-tap-game.tsx`, `src/app/play/[levelId]/listen-tap-game.test.tsx`, `src/app/play/[levelId]/scene/scene-game.tsx`, and `src/app/play/[levelId]/scene/scene-game.test.tsx` to confirm they match what's shown below.

- [ ] **Step 2: Write the failing test for `ListenTapGame`**

Append to `src/app/play/[levelId]/listen-tap-game.test.tsx`, inside the existing `describe('ListenTapGame', ...)` block, after the last `it`:

```tsx
  it('calls onLevelComplete instead of the API when provided', async () => {
    const onLevelComplete = vi.fn()
    const items = [makeItem('a')]
    render(
      <ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} onLevelComplete={onLevelComplete} />
    )

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(onLevelComplete).toHaveBeenCalledWith(3))
    expect(global.fetch).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- listen-tap-game.test`
Expected: FAIL — `ListenTapGame` doesn't accept or use an `onLevelComplete` prop yet, so `finishLevel` still calls `fetch`.

- [ ] **Step 4: Add the prop to `ListenTapGame`**

In `src/app/play/[levelId]/listen-tap-game.tsx`, update the props interface:

```tsx
interface ListenTapGameProps {
  levelId: number
  levelName: string
  vocabItems: VocabGameItem[]
  onLevelComplete?: (starsEarned: number) => Promise<void> | void
}
```

Update the function signature:

```tsx
export function ListenTapGame({ levelId, levelName, vocabItems, onLevelComplete }: ListenTapGameProps) {
```

Replace `finishLevel`:

```tsx
  async function finishLevel(finalStars: number) {
    setPhase('saving')
    if (onLevelComplete) {
      await onLevelComplete(finalStars)
    } else {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'listen-tap' }),
      })
    }
    setPhase('summary')
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- listen-tap-game.test`
Expected: PASS (8 tests — 7 existing, unmodified, plus the 1 new one)

- [ ] **Step 6: Write the failing test for `SceneGame`**

Append to `src/app/play/[levelId]/scene/scene-game.test.tsx`, inside the existing `describe('SceneGame', ...)` block, after the last `it`:

```tsx
  it('calls onLevelComplete instead of the API when provided', async () => {
    const onLevelComplete = vi.fn()
    const scenes = [makeScene(1, [DOG])]
    render(
      <SceneGame
        levelId={3}
        levelName="Descriptors & Animals"
        scenes={scenes}
        onLevelComplete={onLevelComplete}
      />
    )

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(onLevelComplete).toHaveBeenCalledWith(3))
    expect(global.fetch).not.toHaveBeenCalled()
  })
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- scene-game.test`
Expected: FAIL — `SceneGame` doesn't accept or use an `onLevelComplete` prop yet.

- [ ] **Step 8: Add the prop to `SceneGame`**

In `src/app/play/[levelId]/scene/scene-game.tsx`, update the props interface:

```tsx
interface SceneGameProps {
  levelId: number
  levelName: string
  scenes: SceneGameData[]
  onLevelComplete?: (starsEarned: number) => Promise<void> | void
}
```

Update the function signature:

```tsx
export function SceneGame({ levelId, levelName, scenes, onLevelComplete }: SceneGameProps) {
```

Replace `finishLevel`:

```tsx
  async function finishLevel(finalStars: number) {
    setPhase('saving')
    if (onLevelComplete) {
      await onLevelComplete(finalStars)
    } else {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'find-scene' }),
      })
    }
    setPhase('summary')
  }
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- scene-game.test`
Expected: PASS (8 tests — 7 existing, unmodified, plus the 1 new one)

- [ ] **Step 10: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 11: Commit**

```bash
git add "src/app/play/[levelId]/listen-tap-game.tsx" "src/app/play/[levelId]/listen-tap-game.test.tsx" "src/app/play/[levelId]/scene/scene-game.tsx" "src/app/play/[levelId]/scene/scene-game.test.tsx"
git commit -m "feat: support an injectable progress-saving callback in ListenTapGame and SceneGame"
```

---

### Task 6: Guest branch for the Listen & Tap level page

**Files:**
- Modify: `src/app/play/[levelId]/page.tsx`
- Modify: `src/app/play/[levelId]/page.test.tsx`

**Interfaces:**
- Consumes: `GuestLevelGate` (Task 2); `onLevelComplete` prop on `ListenTapGame` (Task 5).
- Produces: no new interfaces.

**Why `page.test.tsx` changes here:** same reasoning as Task 4 — "redirects to login when there is no session" describes exactly the behavior being replaced. No other test in this file changes.

- [ ] **Step 1: Read the current files**

Read `src/app/play/[levelId]/page.tsx` and `src/app/play/[levelId]/page.test.tsx` to confirm they match what's shown below.

- [ ] **Step 2: Update the test file**

Replace the full contents of `src/app/play/[levelId]/page.test.tsx`:

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
vi.mock('@/components/guest-level-gate', () => ({
  GuestLevelGate: ({
    levelId,
    gameType,
    children,
  }: {
    levelId: number
    gameType: string
    children: (onLevelComplete: (stars: number) => void) => React.ReactNode
  }) => (
    <div>
      Guest gate for level {levelId} ({gameType})
      {children(() => {})}
    </div>
  ),
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

  it('renders the guest-gated game when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    vi.mocked(getVocabItemsForLevel).mockResolvedValue([])

    render(await LevelPage({ params: makeParams('1') }))
    expect(screen.getByText('Playing Greetings')).toBeInTheDocument()
    expect(screen.getByText('Guest gate for level 1 (listen-tap)')).toBeInTheDocument()
    expect(redirectMock).not.toHaveBeenCalled()
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

(`'redirects to /play when the level is locked'` and `'renders the game when the level is unlocked'` are unchanged from before — only the no-session test was replaced.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- "play/\[levelId\]/page"`
Expected: FAIL — `LevelPage` still calls `redirect('/login')` when there's no session, and `@/components/guest-level-gate` doesn't exist to mock against yet in the real module graph (the mock intercepts the import, but the page itself doesn't import or use it yet, so the "renders the guest-gated game" test fails to find the expected text).

- [ ] **Step 4: Rewire `play/[levelId]/page.tsx`'s no-session branch**

Replace the full contents of `src/app/play/[levelId]/page.tsx`:

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
import { GuestLevelGate } from '@/components/guest-level-gate'

export default async function LevelPage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId: levelIdParam } = await params
  const levelId = Number(levelIdParam)

  const level = LEVELS.find((candidate) => candidate.id === levelId)
  if (!level) {
    notFound()
  }

  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)
  const supabase = createSupabaseServerClient()

  if (!session) {
    const vocabItems = await getVocabItemsForLevel(supabase, levelId)
    return (
      <GuestLevelGate levelId={levelId} gameType="listen-tap">
        {(onLevelComplete) => (
          <ListenTapGame
            levelId={levelId}
            levelName={level.name}
            vocabItems={vocabItems}
            onLevelComplete={onLevelComplete}
          />
        )}
      </GuestLevelGate>
    )
  }

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

Note the named-account branch still fetches `vocabItems` only after the unlock check passes, exactly as before — only the guest branch fetches it earlier (it has no unlock-check to gate on server-side).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- "play/\[levelId\]/page"`
Expected: PASS (4 tests)

- [ ] **Step 6: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/play/[levelId]/page.tsx" "src/app/play/[levelId]/page.test.tsx"
git commit -m "feat: serve Listen & Tap to guests via GuestLevelGate when there is no session"
```

---

### Task 7: Guest branch for the Find-in-Scene level page

**Files:**
- Modify: `src/app/play/[levelId]/scene/page.tsx`
- Modify: `src/app/play/[levelId]/scene/page.test.tsx`

**Interfaces:**
- Consumes: `GuestLevelGate` (Task 2); `onLevelComplete` prop on `SceneGame` (Task 5).
- Produces: no new interfaces.

**Why `page.test.tsx` changes here:** same reasoning as Tasks 4 and 6. No other test in this file changes.

- [ ] **Step 1: Read the current files**

Read `src/app/play/[levelId]/scene/page.tsx` and `src/app/play/[levelId]/scene/page.test.tsx` to confirm they match what's shown below.

- [ ] **Step 2: Update the test file**

Replace the full contents of `src/app/play/[levelId]/scene/page.test.tsx`:

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
vi.mock('@/components/guest-level-gate', () => ({
  GuestLevelGate: ({
    levelId,
    gameType,
    children,
  }: {
    levelId: number
    gameType: string
    children: (onLevelComplete: (stars: number) => void) => React.ReactNode
  }) => (
    <div>
      Guest gate for level {levelId} ({gameType})
      {children(() => {})}
    </div>
  ),
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

  it('renders the guest-gated scene game when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    vi.mocked(getScenesForLevel).mockResolvedValue([{ id: 1, imageUrl: 'https://example.com/s.png', objects: [] }])

    render(await ScenePage({ params: makeParams('1') }))
    expect(screen.getByText('Playing scene: Greetings')).toBeInTheDocument()
    expect(screen.getByText('Guest gate for level 1 (find-scene)')).toBeInTheDocument()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('calls notFound for a guest visiting a level with no scenes', async () => {
    getMock.mockReturnValue(undefined)
    vi.mocked(getScenesForLevel).mockResolvedValue([])

    await expect(ScenePage({ params: makeParams('1') })).rejects.toThrow('NOT_FOUND')
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

(`'redirects to /play when the level is locked'`, `'calls notFound when the unlocked level has no scenes'`, and `'renders the scene game when the level is unlocked and has scenes'` are unchanged from before — only the no-session test was replaced, and one new test was added for a guest hitting a scene-less level.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- "play/\[levelId\]/scene/page"`
Expected: FAIL — `ScenePage` still calls `redirect('/login')` when there's no session.

- [ ] **Step 4: Rewire `play/[levelId]/scene/page.tsx`'s no-session branch**

Replace the full contents of `src/app/play/[levelId]/scene/page.tsx`:

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
import { GuestLevelGate } from '@/components/guest-level-gate'

export default async function ScenePage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId: levelIdParam } = await params
  const levelId = Number(levelIdParam)

  const level = LEVELS.find((candidate) => candidate.id === levelId)
  if (!level) {
    notFound()
  }

  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)
  const supabase = createSupabaseServerClient()

  if (!session) {
    const scenes = await getScenesForLevel(supabase, levelId)
    if (scenes.length === 0) {
      notFound()
    }
    return (
      <GuestLevelGate levelId={levelId} gameType="find-scene">
        {(onLevelComplete) => (
          <SceneGame levelId={levelId} levelName={level.name} scenes={scenes} onLevelComplete={onLevelComplete} />
        )}
      </GuestLevelGate>
    )
  }

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

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- "play/\[levelId\]/scene/page"`
Expected: PASS (6 tests)

- [ ] **Step 6: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/play/[levelId]/scene/page.tsx" "src/app/play/[levelId]/scene/page.test.tsx"
git commit -m "feat: serve Find-in-Scene to guests via GuestLevelGate when there is no session"
```

---

### Task 8: "Play as guest" on the guest home screen

**Files:**
- Modify: `src/app/home-views.tsx`
- Modify: `src/app/home-views.test.tsx`

**Interfaces:**
- Consumes: `LinkButton` from `src/components/ui/button.tsx`.
- Produces: no new interfaces — this is the entry point users actually click.

- [ ] **Step 1: Read the current files**

Read `src/app/home-views.tsx` and `src/app/home-views.test.tsx` to confirm they match what's shown below.

- [ ] **Step 2: Update the failing test**

In `src/app/home-views.test.tsx`, replace the `describe('GuestHome', ...)` block:

```tsx
describe('GuestHome', () => {
  it('shows a prominent guest-play action alongside signup and login links', () => {
    render(<GuestHome />)
    expect(screen.getByRole('link', { name: 'Play as guest' })).toHaveAttribute('href', '/play')
    expect(screen.getByText('Create an account')).toBeInTheDocument()
    expect(screen.getByText('Log in')).toBeInTheDocument()
  })
})
```

(The `AuthenticatedHome` tests below it are unchanged.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- home-views.test`
Expected: FAIL — there is no "Play as guest" link yet.

- [ ] **Step 4: Add the "Play as guest" action to `GuestHome`**

In `src/app/home-views.tsx`, replace the `GuestHome` function:

```tsx
export function GuestHome() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-md mx-auto p-4">
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-extrabold text-brand-ink">Canto</h1>
          <p className="text-brand-ink">Learn Cantonese through play.</p>
          <div className="flex flex-col gap-3 w-full">
            <LinkButton href="/play" variant="primary" className="w-full">
              Play as guest
            </LinkButton>
            <LinkButton href="/signup" variant="secondary" className="w-full">
              Create an account
            </LinkButton>
            <LinkButton href="/login" variant="secondary" className="w-full">
              Log in
            </LinkButton>
          </div>
        </Card>
      </main>
    </div>
  )
}
```

(`AuthenticatedHome`, below it in the same file, is unchanged.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- home-views.test`
Expected: PASS (3 tests)

- [ ] **Step 6: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: All tests pass, lint clean.

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: build succeeds — this is the final code change in the plan.

- [ ] **Step 8: Commit**

```bash
git add src/app/home-views.tsx src/app/home-views.test.tsx
git commit -m "feat: make Play as guest the prominent action on the guest home screen"
```

---

## Post-implementation: live QA sweep

Using `claude-in-chrome`, with a fresh/incognito-style session (no existing session cookie):

1. Visit `/` — confirm "Play as guest" is the prominent action, with "Create an account"/"Log in" secondary.
2. Click "Play as guest" — confirm it lands on `/play` showing Level 1 unlocked, the rest locked, with no login prompt.
3. Play through Level 1 via Listen & Tap as a guest — confirm stars accumulate and the level-complete screen shows correctly, with no `POST /api/progress` network call (check via `read_network_requests`).
4. Refresh `/play` — confirm the guest's stars from step 3 persisted (still shown, and Level 2 now unlocked if the threshold was met).
5. Try navigating directly to a still-locked level's URL (e.g. `/play/5` before Colors is unlocked) — confirm it bounces back to `/play`.
6. Play the Find-in-Scene game as a guest on an unlocked level with scene content — confirm it works and updates guest progress the same way.
7. Separately, log in as an existing named test account (or sign up a fresh one) and re-confirm the full named-account flow — level list, Listen & Tap, Find-in-Scene, and real `POST /api/progress` calls — behaves exactly as it did before this plan.

## Self-Review

**Spec coverage:**
- `localStorage`-only guest progress, reusing `ProgressRow` → Task 1.
- `GuestLevelGate` client-side unlock check + save callback → Task 2.
- Shared `LevelList` markup between named and guest paths → Task 3 (extraction) and Task 4 (guest usage).
- One URL structure (`/play`, `/play/[levelId]`, `/play/[levelId]/scene`), named-account branch unchanged → Tasks 4, 6, 7.
- Injectable `onLevelComplete` on both games, defaulting to existing behavior → Task 5.
- "Play as guest" prominent on `GuestHome` → Task 8.
- No conversion, no cross-device persistence, no reward-system coupling → not introduced by any task (nothing to build for these non-goals).
- Testing approach (new unit/component tests, the 3 anticipated test replacements, live QA sweep) → every task's steps, plus the Post-implementation section.

**Placeholder scan:** no "TBD"/"handle it"/"similar to Task N" language; every step that touches a file gives its complete contents.

**Type consistency:** `ProgressRow` (from `src/lib/db/progress.ts`, unchanged) is used identically by `getGuestProgress`/`saveGuestLevelProgress` (Task 1), `GuestLevelGate` (Task 2, via `computeLevelStatus`), and `GuestPlayPage` (Task 4). `LevelStatus` (from `src/lib/game/level-status.ts`, unchanged) flows identically into `LevelList` (Task 3) from both the server-rendered path (Task 3/4) and `GuestPlayPage` (Task 4). The `onLevelComplete` prop signature — `(starsEarned: number) => Promise<void> | void` — is defined identically in Task 5 for both games and consumed identically by `GuestLevelGate`'s render-prop callback in Tasks 6 and 7. `gameType` string literals (`'listen-tap'`, `'find-scene'`) match exactly between each game's default `fetch` body (unchanged, Task 5) and the `gameType` prop passed to `GuestLevelGate` in Tasks 6 and 7.
