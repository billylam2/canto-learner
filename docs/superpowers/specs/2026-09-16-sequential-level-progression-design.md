# Sequential Level Progression Design

## Problem

Levels currently unlock based on cumulative stars earned across all levels (`LEVELS[i].unlockThreshold`). Once a level unlocks, both of its game types — Listen & Tap and, where it exists, Find in the Scene — become available immediately, with no ordering between them.

The desired behavior is a strict chain: completing a level's Listen & Tap unlocks that level's Find in the Scene (where one exists); completing that unlocks the next level's Listen & Tap. Star thresholds are removed as an unlock mechanism entirely; stars remain purely informational.

## Current levels and scene content

| Level | Name | Has scene? |
|---|---|---|
| 1 | Greetings | No |
| 2 | People & Family | Yes |
| 3 | Descriptors & Animals | Yes |
| 4 | Numbers | No |
| 5 | Colors | Yes |

Levels without scene content skip the scene step: completing Listen & Tap for such a level unlocks the next level's Listen & Tap directly.

## Data model

No new database columns or localStorage fields. `ProgressRow` (`src/lib/db/progress.ts`) already tracks `completedGameTypes: string[]` per level, for both authenticated (Supabase) and guest (localStorage) progress. This is sufficient to derive the entire chain.

Define, for each level, its **terminal step**: `'find-scene'` if the level has scene content, else `'listen-tap'`.

`computeLevelStatus` (`src/lib/game/level-status.ts`) changes:

- **`unlocked`** (existing field, redefined): Level 1 (lowest `order`) is always unlocked. For level *i* (i>1, in `order`), unlocked iff the previous level's terminal step is present in that previous level's `completedGameTypes`.
- **`sceneUnlocked`** (new field): true iff the level itself is `unlocked` AND `'listen-tap'` is present in that level's own `completedGameTypes`. Computed for every level for simplicity, though only levels with scene content ever use it.
- `unlockThreshold` is removed from `LevelSource` (`content/vocab.ts`) and from the `LEVELS` array. The `unlock_threshold` database column (`supabase/migrations/0002_create_content_tables.sql`) stays in place, unused — it is `not null default 0`, so omitting it from `upsertLevel`'s upsert payload (`src/lib/db/content.ts`) is safe: inserts get the default, and updates simply don't touch that column. No new migration.

`computeLevelStatus` needs to know which levels have scene content. It gains a new required parameter, `levelIdsWithScenes: Set<number>`, computed by call sites from `content/scenes.ts`'s `SCENES` export (`new Set(SCENES.map(s => s.levelId))`) — the same derivation `src/components/level-list.tsx` already does today for its own `LEVEL_IDS_WITH_SCENES` constant. This keeps `level-status.ts` free of a direct dependency on `content/scenes.ts` and keeps the function easily testable with small synthetic inputs.

Updated signature:

```ts
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
): LevelStatus[]
```

## Call sites to update

`level-list.tsx` only renders the `LevelStatus[]` it's given (its own changes are covered under "UI behavior" below); `computeLevelStatus` itself is called from four places, each needing the new `levelIdsWithScenes` argument:

- **`src/app/play/page.tsx`**: pass the scene-id set to `computeLevelStatus`.
- **`src/app/guest-play-page.tsx`**: same.
- **`src/app/play/[levelId]/scene/page.tsx`**: same, and change its gate from `status?.unlocked` to `status?.sceneUnlocked`.
- **`src/app/play/[levelId]/page.tsx`**: same call-site update (pass the new parameter); its gate stays `status?.unlocked` (unchanged meaning: "is this level's Listen & Tap reachable").
- **`src/lib/guest/use-guest-level-gate.ts`**: pass the scene-id set; branch the unlock check on `gameType` — use `level?.sceneUnlocked` when `gameType === 'find-scene'`, else `level?.unlocked`.

All five call sites derive the scene-id set the same way: `new Set(SCENES.map((scene) => scene.levelId))`, importing `SCENES` from `content/scenes.ts`. `src/components/level-list.tsx`'s existing `LEVEL_IDS_WITH_SCENES` constant can be reused/exported, or each call site can compute its own small constant — implementer's call, favoring whichever avoids a new shared-constants file for a two-line computation already duplicated once today.

## UI behavior

**`src/components/level-list.tsx`** (unlocked level card):
- "Listen & Tap" button: always enabled, as today.
- "Find in the Scene" button (only rendered at all when the level has scene content, as today): now always rendered when the level has scene content (not conditionally hidden), but disabled/greyed when `!level.sceneUnlocked`, with a small inline hint (e.g. "Finish Listen & Tap first"). Enabled and normal when `level.sceneUnlocked`.

**`src/components/ui/locked-level-card.tsx`**:
- Drop the `unlockThreshold` prop and its "(unlocks at N stars)" text.
- Replace with static copy: "locked — finish the previous level first".

## Testing plan

- **`src/lib/game/level-status.test.ts`**: rewritten around the new chain logic — level 1 always unlocked; level 2 locked until level 1's `completedGameTypes` includes `'listen-tap'` (level 1 has no scene); level 3 locked until level 2's `completedGameTypes` includes `'find-scene'` (level 2 has a scene); `sceneUnlocked` true only after that level's own `'listen-tap'` completion; a level with no scene content never reports a meaningfully-used `sceneUnlocked` (still computed, just unused downstream).
- **`src/components/level-list.test.tsx`**: update for the new disabled-button-with-hint behavior and the dropped star-threshold copy.
- **`src/components/ui/locked-level-card.test.tsx`**: update for the new static copy, remove `unlockThreshold`-prop tests.
- **`src/lib/guest/use-guest-level-gate.test.tsx`**: add a case verifying `gameType: 'find-scene'` checks `sceneUnlocked` rather than `unlocked`.
- **`src/app/play/[levelId]/scene/page.test.tsx`**: update the gating assertion to `sceneUnlocked`.
- **`src/app/play/page.test.tsx`**, **`src/app/play/[levelId]/page.test.tsx`**: update fixtures/mocks for `computeLevelStatus`'s new third parameter and the `sceneUnlocked` field; remove any remaining star-threshold-based assertions superseded by the chain logic.
- **`content/vocab.test.ts`**: remove any assertion tied to `unlockThreshold` existing on `LevelSource`.

## Out of scope

- No changes to how stars are earned, saved, or displayed (`saveLevelProgress` / `saveGuestLevelProgress`, `StarRating`).
- No changes to Find-in-Scene or Listen & Tap gameplay mechanics.
- No database migration — `unlock_threshold` column is abandoned in place, not dropped.
- Items 2 (Listen & Tap randomization) and 3 (responsive sizing) from the same request are separate, already-implemented bounded changes and are not part of this spec.
