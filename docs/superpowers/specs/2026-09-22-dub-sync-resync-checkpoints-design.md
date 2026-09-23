# Dub Sync Resync Checkpoints Design

## Purpose

`englishTimeFor` maps a Cantonese timestamp to the corresponding English timestamp using a single straight line between two fixed points: the episode's content-start and content-end anchors (`src/lib/dub-sync/normalize.ts`). That's the formula behind three things: the resync interval that keeps the English player following along during synced playback, the spacebar handler that computes a marked segment's `englishStart`/`englishEnd`, and caption-based segment generation. A single straight line across an entire episode assumes the two dubs pace identically throughout — in practice they don't (a longer pause here, a rephrased line there), so the line drifts away from the truth as marking progresses further from content start. Because the resync interval keeps chasing that same wrong line, what's on screen still looks synced even as the *computed* times it's chasing become wrong — so segments recorded via the spacebar later in an episode can end up with `englishStart`/`englishEnd` visibly off, without anything on screen signaling that it happened.

This spec adds **resync checkpoints**: extra Cantonese/English time pairs an admin can insert mid-episode, while marking, whenever they notice drift. `englishTimeFor` becomes piecewise-linear across content-start, every checkpoint, and content-end (in `cantoTime` order) instead of one line across the whole episode — a checkpoint only corrects the mapping in its local neighborhood, and every consumer of `englishTimeFor` benefits automatically.

## Decisions

- **Interaction**: a new **"Resync checkpoint"** button sits next to "Play synced"/"Pause synced"/"Go to content start", enabled only while `syncing` is true. Clicking it pauses both players (freezing the Cantonese position as the fixed reference) and enters checkpoint-adjustment mode:
  - Nudge buttons shift **only the English player's current position**, by a fixed delta each press: coarse (±0.5s) and fine (±0.1s). Each nudge is a plain `seekTo(currentTime + delta, true)` on the English player — no automatic replay.
  - Separate **Play**/**Pause** preview buttons (not the existing "Play synced" toggle) play/pause both players from their current positions so the admin can listen after nudging, as many times as needed, entirely independent of `syncing`/the resync interval/the spacebar listener — none of those should reactivate mid-adjustment, since the resync interval would otherwise chase the still-wrong old formula and fight the manual nudge within a second.
  - **Confirm** captures `{ cantoTime, englishTime }` from both players' current positions, POSTs it as a new checkpoint, and returns to the paused state (`syncing` stays `false` — the admin clicks "Play synced" again to resume, same as every other action here). If the server rejects it (see validation below), the specific error is shown inline and adjustment mode stays open so the admin can nudge further and retry.
  - **Cancel** exits adjustment mode without saving. Nothing needs to be reverted — the resync interval re-settles the English player's position on its own within a second of playback resuming.
  - Entering adjustment mode sets `syncing` to `false` (via the existing `stopSyncedPlayback`-style pause), which — for free — already suspends the resync interval and the spacebar marking listener, since both are already gated on `syncing`. A new `adjustingCheckpoint` boolean state controls only the adjustment UI itself (nudge/preview/confirm/cancel controls replacing the sync controls while true) and the "Resync checkpoint" button's payload capture.
- **Mapping**: `englishTimeFor` builds the full sorted list of known points — content-start, every checkpoint, content-end, sorted by `cantoTime` — and interpolates linearly between whichever consecutive pair brackets the requested `cantoTime` (extrapolating from the nearest edge segment for a `cantoTime` outside the marked range, same as today). With zero checkpoints this is exactly one segment from content-start to content-end — mathematically identical to today's formula, so existing behavior is unchanged for episodes that don't need checkpoints.
- **Validation**: a checkpoint is rejected (create or edit) unless it's strictly increasing in *both* `cantoTime` and `englishTime` relative to its immediate neighbors once inserted into the sorted point list (content-start/content-end always count as neighbors at the ends). Otherwise the piecewise mapping would go backwards locally and silently produce inverted/negative-duration segments downstream — the same bug class already guarded against for spacebar marking (`cantoEnd <= pendingStart` discard).
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

interface AnchorPoint {
  cantoTime: number
  englishTime: number
}

// The full sorted list of known canto<->english time correspondences for an episode: content
// start, every resync checkpoint, and content end. englishTimeFor interpolates between
// consecutive pairs of this list rather than using one line across the whole episode, so a
// checkpoint only affects the local region around it. DubResyncCheckpoint (id + episodeId +
// these two fields) satisfies this shape structurally, so callers can pass persisted checkpoints
// straight through without mapping them first.
export function buildAnchorPoints(anchors: EpisodeAnchors, checkpoints: ResyncCheckpoint[]): AnchorPoint[] {
  const points = [
    { cantoTime: anchors.cantoContentStart, englishTime: anchors.englishContentStart },
    ...checkpoints,
    { cantoTime: anchors.cantoContentEnd, englishTime: anchors.englishContentEnd },
  ]
  return points.sort((a, b) => a.cantoTime - b.cantoTime)
}

function bracket(points: AnchorPoint[], cantoT: number): [AnchorPoint, AnchorPoint] {
  for (let i = 0; i < points.length - 1; i++) {
    if (cantoT <= points[i + 1].cantoTime) return [points[i], points[i + 1]]
  }
  return [points[points.length - 2], points[points.length - 1]]
}

export function englishTimeFor(
  cantoT: number,
  anchors: EpisodeAnchors,
  checkpoints: ResyncCheckpoint[] = []
): number {
  const points = buildAnchorPoints(anchors, checkpoints)
  const [lower, upper] = bracket(points, cantoT)
  const span = upper.cantoTime - lower.cantoTime

  if (span <= 0) {
    throw new Error('Invalid anchors: cantoContentEnd must be after cantoContentStart')
  }

  const ratio = (cantoT - lower.cantoTime) / span
  return lower.englishTime + ratio * (upper.englishTime - lower.englishTime)
}
```

`bracket` always resolves to `[points[0], points[1]]` when there are exactly two points (the zero-checkpoint case), regardless of `cantoT` — identical to today's unconditional single-line extrapolation, so the existing `normalize.test.ts` assertions keep passing unmodified.

New file `src/lib/dub-sync/resync-checkpoints.ts` (kept separate from `normalize.ts` since this is API-layer input validation, not time-mapping math — it depends on `normalize.ts`, not the other way around):

```ts
import { buildAnchorPoints, type EpisodeAnchors, type ResyncCheckpoint } from './normalize'

// Ensures inserting or editing this checkpoint keeps the canto->english mapping monotonic: both
// times must strictly increase from the point immediately before it to the point immediately
// after, once placed into the full sorted list (content start/end plus every OTHER existing
// checkpoint — the one being edited, if any, must already be excluded from otherCheckpoints by
// the caller). Returns an error message, or null if the checkpoint is valid.
export function validateCheckpointOrder(
  anchors: EpisodeAnchors,
  otherCheckpoints: ResyncCheckpoint[],
  candidate: ResyncCheckpoint
): string | null {
  const points = buildAnchorPoints(anchors, [...otherCheckpoints, candidate])
  const index = points.indexOf(candidate)
  const prev = points[index - 1]
  const next = points[index + 1]

  if (prev && (candidate.cantoTime <= prev.cantoTime || candidate.englishTime <= prev.englishTime)) {
    return 'Checkpoint must come after the previous checkpoint in both videos'
  }
  if (next && (candidate.cantoTime >= next.cantoTime || candidate.englishTime >= next.englishTime)) {
    return 'Checkpoint must come before the next checkpoint in both videos'
  }
  return null
}
```

`indexOf(candidate)` relies on reference equality — `candidate` is spread into the array by reference, untouched by `sort`, so this is safe.

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
- Every `englishTimeFor` call in this file passes `checkpointsByEpisode[episode.id] ?? []` as the third argument.
- New `CheckpointTable` component (new file `src/app/dub-sync/admin/checkpoint-table.tsx`, structured like `segment-table.tsx`: a table + per-row component with editable `cantoTime`/`englishTime` number inputs saving on blur via `PATCH`, and a Delete button) renders unconditionally near the sync controls, above `SegmentTable`.

`src/app/dub-sync/admin/page.tsx`: adds a `listResyncCheckpoints` loop building `checkpointsByEpisode`, passed to `Admin` alongside `segmentsByEpisode`.

`src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.ts` and `src/lib/dub-sync/candidate-segments.ts`: fetch/thread the episode's checkpoints through to `englishTimeFor` the same way.

## Testing

- `normalize.test.ts`: existing zero-checkpoint assertions stay as regression coverage; new cases for one checkpoint (interpolates within each of the two resulting segments correctly) and multiple checkpoints (correct segment selected for a `cantoTime` in each region, including before the first checkpoint and after the last).
- New `resync-checkpoints.test.ts`: `validateCheckpointOrder` — valid checkpoint between two existing ones; rejects one at or before the previous checkpoint's `cantoTime`/`englishTime`; rejects one at or after the next checkpoint's; valid with zero existing checkpoints; valid checkpoint being edited (excluded from `otherCheckpoints`) doesn't reject against its own prior value.
- `dub-sync.test.ts`: `createResyncCheckpoint`, `updateResyncCheckpoint`, `deleteResyncCheckpoint`, `listResyncCheckpoints` (ordering by `canto_time`).
- New route tests for `checkpoints/route.ts` and `checkpoints/[checkpointId]/route.ts`: auth check, missing-field 400, episode-not-found 404, validation-failure 400 (with the specific message), success (201/200).
- `synced-playback.test.ts`: `computeResyncTarget` given checkpoints resolves against the piecewise mapping, not just the two content anchors.
- `admin.test.tsx`: "Resync checkpoint" button entering adjustment mode (pauses both players, hides sync controls, shows the panel); nudge buttons shifting only the English player's current time by the expected delta; preview Play/Pause acting on both players without touching `syncing`; Confirm posting and adding the returned checkpoint to the table; Confirm failure keeping adjustment mode open and showing the server message; Cancel discarding without a request; the checkpoint table's inline edit/delete (mirroring the existing segment-table tests).

## Out of Scope

- Any automatic drift *detection* (e.g. periodically re-running the frame-hash alignment search used by "Refine precision" to suggest a checkpoint on its own) — checkpoints are added by the admin's own judgment only, when they notice drift while marking.
- Visualizing the piecewise mapping (e.g. a graph of canto-time vs. english-time showing each segment) — the checkpoint table's plain list of time pairs is enough to manage them.
- Applying checkpoints retroactively to already-recorded segments — this only affects segments recorded (or caption-generated) after a checkpoint exists; correcting earlier segments is a separate, manual edit-the-segment-row task, same as any other segment correction today.
