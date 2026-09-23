# Dub Sync Resync Checkpoints Design

## Purpose

`englishTimeFor` maps a Cantonese timestamp to the corresponding English timestamp using a single straight line between two fixed points: the episode's content-start and content-end anchors (`src/lib/dub-sync/normalize.ts`). That's the formula behind three things: the resync interval that keeps the English player following along during synced playback, the spacebar handler that computes a marked segment's `englishStart`/`englishEnd`, and caption-based segment generation. A single straight line across an entire episode assumes the two dubs pace identically throughout — in practice they don't (a longer pause here, a rephrased line there), so the line drifts away from the truth as marking progresses further from content start. Because the resync interval keeps chasing that same wrong line, what's on screen still looks synced even as the *computed* times it's chasing become wrong — so segments recorded via the spacebar later in an episode can end up with `englishStart`/`englishEnd` visibly off, without anything on screen signaling that it happened.

This spec adds **resync checkpoints**: a Cantonese/English time pair an admin can insert mid-episode, while marking, whenever they notice drift. Each checkpoint is a fixed correction: once Cantonese playback passes that timestamp, `englishTimeFor` applies a constant shift on top of the original content-start/content-end line, from then on, until a later checkpoint supersedes it with its own shift. The original line's pace is never recalculated — nothing here ever needs the English player to play at anything other than its normal fixed rate (see the "no continuous rate changes" note below); a checkpoint only changes what number the formula produces, at the moment it's crossed.

## Decisions

- **Interaction**: a new **"Resync checkpoint"** button sits next to "Play synced"/"Pause synced"/"Go to content start", enabled only while `syncing` is true. Clicking it pauses both players (freezing the Cantonese position as the fixed reference) and enters checkpoint-adjustment mode:
  - Nudge buttons shift **only the English player's current position**, by a fixed delta each press: coarse (±0.5s) and fine (±0.1s). Each nudge is a plain `seekTo(currentTime + delta, true)` on the English player — no automatic replay.
  - Separate **Play**/**Pause** preview buttons (not the existing "Play synced" toggle) play/pause both players from their current positions so the admin can listen after nudging, as many times as needed, entirely independent of `syncing`/the resync interval/the spacebar listener — none of those should reactivate mid-adjustment, since the resync interval would otherwise chase the still-wrong old formula and fight the manual nudge within a second.
  - **Confirm** captures `{ cantoTime, englishTime }` from both players' current positions, POSTs it as a new checkpoint, and returns to the paused state (`syncing` stays `false` — the admin clicks "Play synced" again to resume, same as every other action here). If the server rejects it (see validation below), the specific error is shown inline and adjustment mode stays open so the admin can nudge further and retry.
  - **Cancel** exits adjustment mode without saving. Nothing needs to be reverted — the resync interval re-settles the English player's position on its own within a second of playback resuming.
  - Entering adjustment mode sets `syncing` to `false` (via the existing `stopSyncedPlayback`-style pause), which — for free — already suspends the resync interval and the spacebar marking listener, since both are already gated on `syncing`. A new `adjustingCheckpoint` boolean state controls only the adjustment UI itself (nudge/preview/confirm/cancel controls replacing the sync controls while true) and the "Resync checkpoint" button's payload capture.
- **No continuous rate changes**: exactly as the existing synced-marking spec already decided for the resync interval, nothing here ever touches `setPlaybackRate`. A checkpoint's "shift" is a one-time constant added to the formula's output from that Cantonese timestamp forward — applied only via the same two existing discrete mechanisms (the resync interval's periodic `seekTo`, and the formula used to compute a recorded segment's times), never by asking a player to play at a custom continuous speed.
- **Mapping**: `englishTimeFor` keeps computing the original two-anchor line exactly as it does today (call it the *base* time), unaffected by checkpoints. Separately, it finds the checkpoint with the greatest `cantoTime` that is still `<= cantoT` (the most recently "encountered" one, if any). If none, it returns the base time unchanged. If one exists, its `shift` — computed once, as `checkpoint.englishTime - base time at the checkpoint's own cantoTime` — is added to the current base time. This means: before any checkpoint's `cantoTime`, behavior is identical to today; after one, the output is offset by a constant, deliberately jumping at the instant each checkpoint is crossed rather than blending in gradually — that jump *is* the correction. With zero checkpoints this is exactly today's formula, unchanged, so existing behavior is unaffected for episodes that don't need any.
- **Validation**: a checkpoint is rejected (create or edit) if its `cantoTime` falls outside the marked content span (`cantoContentStart < cantoTime < cantoContentEnd`), or exactly matches an existing checkpoint's `cantoTime` (ambiguous ordering). Unlike the interpolation-based design this replaced, there's no constraint on `englishTime` relative to other checkpoints — a checkpoint correcting *backward* is legitimate (the Cantonese dub can very well have extra content the English one doesn't, meaning the correct English time for a later point is earlier than previously predicted).
- **Guarding a backward jump mid-segment**: because a checkpoint's correction can jump backward, it's possible (if a checkpoint happens to be added between the moment a segment's `cantoStart` and `cantoEnd` are captured — an unusual but possible sequence) for the computed `englishEnd` to land at or before `englishStart`. The spacebar `keyup` handler's existing "discard on `cantoEnd <= pendingStart`" guard gains a parallel check — computed `englishEnd <= englishStart` is discarded the same way, instead of saving a nonsensical segment.
- **Persistence**: checkpoints are saved per episode in Supabase, loaded alongside segments/anchors on the admin page's initial fetch, so an interrupted marking session doesn't lose corrections already made.
- **Managing checkpoints**: a table under the sync controls lists all of an episode's checkpoints (Cantonese time, English time), each row editable in place — number inputs save on blur via `PATCH`, mirroring `segment-table.tsx`'s existing pattern exactly — plus a Delete button per row. Unlike segment rows' generic "Failed to save — try again", a checkpoint save failure shows the server's specific validation message, since the error here is actionable (nudge the value and retry) rather than transient.

## Data Model

New migration `supabase/migrations/0008_create_dub_sync_checkpoints.sql`:

```sql
create table dub_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references dub_episodes(id) on delete cascade,
  canto_time real not null,
  english_time real not null,
  created_at timestamptz not null default now()
);

alter table dub_sync_checkpoints enable row level security;
```

Applying it is a manual step for the operator, same as every other migration in this repo.

`src/lib/db/dub-sync.ts` gains, following its existing snake_case-row / camelCase-domain-type convention (parallel to `DubSegment`):

```ts
export interface DubResyncCheckpoint {
  id: string
  episodeId: string
  cantoTime: number
  englishTime: number
}

export interface UpdateResyncCheckpointInput {
  cantoTime?: number
  englishTime?: number
}

export async function listResyncCheckpoints(supabase: SupabaseClient, episodeId: string): Promise<DubResyncCheckpoint[]>
// orders by canto_time ascending — consumers always want them in mapping order, and there's no
// separate manual-reorder concept the way segments have `position`.

export async function createResyncCheckpoint(
  supabase: SupabaseClient,
  episodeId: string,
  input: { cantoTime: number; englishTime: number }
): Promise<DubResyncCheckpoint>

export async function updateResyncCheckpoint(
  supabase: SupabaseClient,
  checkpointId: string,
  patch: UpdateResyncCheckpointInput
): Promise<DubResyncCheckpoint>

export async function deleteResyncCheckpoint(supabase: SupabaseClient, checkpointId: string): Promise<void>
```

## Mapping and Validation (`src/lib/dub-sync/normalize.ts`)

```ts
export interface ResyncCheckpoint {
  cantoTime: number
  englishTime: number
}

// The original two-anchor line, unaffected by any checkpoint — used both as englishTimeFor's
// answer before any checkpoint has been reached, and to work out each checkpoint's own shift.
function baseEnglishTime(cantoT: number, anchors: EpisodeAnchors): number {
  const { cantoContentStart, cantoContentEnd, englishContentStart, englishContentEnd } = anchors
  const cantoSpan = cantoContentEnd - cantoContentStart

  if (cantoSpan <= 0) {
    throw new Error('Invalid anchors: cantoContentEnd must be after cantoContentStart')
  }

  const ratio = (cantoT - cantoContentStart) / cantoSpan
  return englishContentStart + ratio * (englishContentEnd - englishContentStart)
}

// The checkpoint with the greatest cantoTime that is still <= cantoT — the last one "encountered"
// by the time playback reaches cantoT — or null if cantoT is before all of them (or there are
// none). DubResyncCheckpoint (id + episodeId + these two fields) satisfies this shape
// structurally, so callers can pass persisted checkpoints straight through without mapping them.
function mostRecentCheckpoint(checkpoints: ResyncCheckpoint[], cantoT: number): ResyncCheckpoint | null {
  let active: ResyncCheckpoint | null = null
  for (const checkpoint of checkpoints) {
    if (checkpoint.cantoTime > cantoT) continue
    if (!active || checkpoint.cantoTime > active.cantoTime) active = checkpoint
  }
  return active
}

export function englishTimeFor(
  cantoT: number,
  anchors: EpisodeAnchors,
  checkpoints: ResyncCheckpoint[] = []
): number {
  const base = baseEnglishTime(cantoT, anchors)
  const active = mostRecentCheckpoint(checkpoints, cantoT)
  if (!active) return base

  const shift = active.englishTime - baseEnglishTime(active.cantoTime, anchors)
  return base + shift
}
```

With zero checkpoints, `mostRecentCheckpoint` always returns `null`, so `englishTimeFor` reduces to exactly today's formula (including throwing on an invalid anchor span) — the existing `normalize.test.ts` assertions keep passing unmodified.

New file `src/lib/dub-sync/resync-checkpoints.ts` (kept separate from `normalize.ts` since this is API-layer input validation, not time-mapping math — it depends on `normalize.ts`, not the other way around):

```ts
import type { EpisodeAnchors, ResyncCheckpoint } from './normalize'

// A checkpoint must fall strictly within the marked content span, and not collide with an
// existing checkpoint's exact cantoTime (which would make "the most recently encountered
// checkpoint" ambiguous). There's no constraint relative to other checkpoints' englishTime — a
// checkpoint correcting backward is legitimate. Returns an error message, or null if valid.
export function validateCheckpointOrder(
  anchors: EpisodeAnchors,
  otherCheckpoints: ResyncCheckpoint[],
  candidate: ResyncCheckpoint
): string | null {
  if (candidate.cantoTime <= anchors.cantoContentStart || candidate.cantoTime >= anchors.cantoContentEnd) {
    return 'Checkpoint must fall within the marked content'
  }
  if (otherCheckpoints.some((checkpoint) => checkpoint.cantoTime === candidate.cantoTime)) {
    return 'A checkpoint already exists at that Cantonese time'
  }
  return null
}
```

## API

**`POST /api/dub-sync/episodes/[episodeId]/checkpoints`** (admin-only):
1. Require admin session (401 if missing).
2. Parse `{ cantoTime, englishTime }` from the body (both required numbers; 400 if missing/wrong type, matching the existing segments-route validation style).
3. Fetch the episode (404 if missing) and its existing checkpoints via `listResyncCheckpoints`.
4. Run `validateCheckpointOrder(episode, existingCheckpoints, { cantoTime, englishTime })`; 400 with the returned message if invalid.
5. `createResyncCheckpoint`; respond `{ checkpoint }` (201).

**`PATCH /api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]`**:
1. Require admin session (401 if missing).
2. Parse the partial `{ cantoTime?, englishTime? }` patch.
3. Fetch the episode and its existing checkpoints; merge the patch onto the checkpoint being edited to form the candidate, and exclude that checkpoint (by id) from `otherCheckpoints`.
4. Run `validateCheckpointOrder`; 400 with the returned message if invalid.
5. `updateResyncCheckpoint`; respond `{ checkpoint }`.

**`DELETE /api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]`**: same shape as the segments delete route — admin check, `deleteResyncCheckpoint`, `{ ok: true }`.

`GET` admin page load additionally calls `listResyncCheckpoints` per episode (parallel to the existing `listSegments` per episode) and passes the result down to the client component.

Every existing `englishTimeFor` call site threads the relevant episode's checkpoints through as the third argument: the spacebar handler and `computeResyncTarget` in `admin.tsx`/`synced-playback.ts`, and caption-based segment generation in `generate-segments/route.ts`/`candidate-segments.ts`.

## Component Changes

`src/app/dub-sync/admin/admin.tsx`:
- Add `checkpointsByEpisode` state (parallel to `segmentsByEpisode`, seeded from the page's initial fetch) and `handleCheckpointUpdated`/`handleCheckpointDeleted`/`handleCheckpointCreated` handlers mirroring the existing segment ones.
- Add `adjustingCheckpoint` boolean state, and handlers: `enterCheckpointAdjustment` (calls the existing `stopSyncedPlayback` — pausing both players, resetting playback rate to 1x so preview listening isn't sped up, and setting `syncing` to `false` — then sets `adjustingCheckpoint` to `true`), `nudgeEnglish(deltaSeconds)`, `previewPlay`/`previewPause` (play/pause both players directly, independent of `syncing`), `confirmCheckpoint` (POSTs, appends+resorts into `checkpointsByEpisode` on success, shows the server error inline and stays open on failure, otherwise sets `adjustingCheckpoint` to `false`), `cancelCheckpointAdjustment` (just sets `adjustingCheckpoint` to `false`).
- The "Resync checkpoint" button and the adjustment panel (nudge buttons, preview Play/Pause, Confirm/Cancel, inline error) render in the sync-controls area described in Decisions; the panel replaces the "Hold SPACE..." instruction line while `adjustingCheckpoint` is true.
- Every `englishTimeFor` call in this file passes `checkpointsByEpisode[episode.id] ?? []` as the third argument. The spacebar `keyup` handler's segment-creation branch adds the `englishEnd <= englishStart` discard described in Decisions, alongside its existing `cantoEnd <= pendingStart` check.
- New `CheckpointTable` component (new file `src/app/dub-sync/admin/checkpoint-table.tsx`, structured like `segment-table.tsx`: a table + per-row component with editable `cantoTime`/`englishTime` number inputs saving on blur via `PATCH`, and a Delete button) renders unconditionally near the sync controls, above `SegmentTable`.

`src/app/dub-sync/admin/page.tsx`: adds a `listResyncCheckpoints` loop building `checkpointsByEpisode`, passed to `Admin` alongside `segmentsByEpisode`.

`src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.ts` and `src/lib/dub-sync/candidate-segments.ts`: fetch/thread the episode's checkpoints through to `englishTimeFor` the same way.

## Testing

- `normalize.test.ts`: existing zero-checkpoint assertions stay as regression coverage; new cases for a `cantoT` before the first checkpoint (base time, unaffected), between two checkpoints (the earlier one's shift applies), after the last checkpoint (the last one's shift applies), and a checkpoint whose `englishTime` corrects backward relative to the base line's prediction.
- New `resync-checkpoints.test.ts`: `validateCheckpointOrder` — valid checkpoint within content bounds; rejects one at/before `cantoContentStart` or at/after `cantoContentEnd`; rejects one colliding with an existing checkpoint's exact `cantoTime`; valid with zero existing checkpoints; a checkpoint being edited (excluded from `otherCheckpoints`) doesn't collide against its own prior value.
- `dub-sync.test.ts`: `createResyncCheckpoint`, `updateResyncCheckpoint`, `deleteResyncCheckpoint`, `listResyncCheckpoints` (ordering by `canto_time`).
- New route tests for `checkpoints/route.ts` and `checkpoints/[checkpointId]/route.ts`: auth check, missing-field 400, episode-not-found 404, validation-failure 400 (with the specific message), success (201/200).
- `synced-playback.test.ts`: `computeResyncTarget` given checkpoints resolves against the shifted mapping, not just the two content anchors.
- `admin.test.tsx`: "Resync checkpoint" button entering adjustment mode (pauses both players, hides sync controls, shows the panel); nudge buttons shifting only the English player's current time by the expected delta; preview Play/Pause acting on both players without touching `syncing`; Confirm posting and adding the returned checkpoint to the table; Confirm failure keeping adjustment mode open and showing the server message; Cancel discarding without a request; the spacebar handler's new `englishEnd <= englishStart` discard case; the checkpoint table's inline edit/delete (mirroring the existing segment-table tests).

## Out of Scope

- Any automatic drift *detection* (e.g. periodically re-running the frame-hash alignment search used by "Refine precision" to suggest a checkpoint on its own) — checkpoints are added by the admin's own judgment only, when they notice drift while marking.
- Visualizing the shifted mapping (e.g. a graph of canto-time vs. english-time showing each correction) — the checkpoint table's plain list of time pairs is enough to manage them.
- Applying checkpoints retroactively to already-recorded segments — this only affects segments recorded (or caption-generated) after a checkpoint exists; correcting earlier segments is a separate, manual edit-the-segment-row task, same as any other segment correction today.
