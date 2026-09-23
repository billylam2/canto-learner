# Dub Sync Resync Checkpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin insert a mid-episode Cantonese/English time correction ("resync checkpoint") while marking segments, so `englishTimeFor` stops drifting for segments recorded later in a long marking session — plus a hover-title pass on every admin page button.

**Architecture:** `englishTimeFor` keeps computing its existing two-anchor line unchanged (the "base" time), and separately applies a constant `shift` from the most-recently-crossed checkpoint on top of it. Checkpoints persist per episode in a new Supabase table, managed through a small CRUD API and an editable table in the admin UI (mirroring the existing segment table), and captured via a pause-and-nudge panel that shifts only the English player's paused position before confirming.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres), React (admin client component), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-dub-sync-resync-checkpoints-design.md`

## Global Constraints

- Checkpoint's `cantoTime` must fall strictly within `(cantoContentStart, cantoContentEnd)` and must not collide with another checkpoint's exact `cantoTime`. No constraint on `englishTime` relative to other checkpoints — backward corrections are legitimate.
- Nothing in this feature ever calls `setPlaybackRate` to a non-standard value for synchronization purposes — corrections are always discrete (`seekTo` or a formula's output), never a continuous custom playback rate.
- `englishTimeFor` with zero checkpoints must remain byte-for-byte identical to its current behavior (including throwing `'Invalid anchors: cantoContentEnd must be after cantoContentStart'`), so all existing callers and tests keep working unmodified.
- Every new/modified admin-page button gets a `title` attribute (plain HTML hover tooltip, no new dependency).
- Follow this repo's snake_case-row / camelCase-domain-type convention in `src/lib/db/dub-sync.ts`, and its admin-session-gated route pattern (401 via `readAdminSession`) in every new route.

---

## Task 1: Data model — migration + db CRUD for resync checkpoints

**Files:**
- Create: `supabase/migrations/0008_create_dub_sync_checkpoints.sql`
- Modify: `src/lib/db/dub-sync.ts`
- Test: `src/lib/db/dub-sync.test.ts`

**Interfaces:**
- Produces: `DubResyncCheckpoint { id: string; episodeId: string; cantoTime: number; englishTime: number }`, `UpdateResyncCheckpointInput { cantoTime?: number; englishTime?: number }`, `listResyncCheckpoints(supabase, episodeId): Promise<DubResyncCheckpoint[]>`, `createResyncCheckpoint(supabase, episodeId, input: { cantoTime: number; englishTime: number }): Promise<DubResyncCheckpoint>`, `updateResyncCheckpoint(supabase, checkpointId, patch: UpdateResyncCheckpointInput): Promise<DubResyncCheckpoint>`, `deleteResyncCheckpoint(supabase, checkpointId): Promise<void>` — all from `src/lib/db/dub-sync.ts`, used by Task 4's routes.

- [ ] **Step 1: Write the migration**

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

Save this as `supabase/migrations/0008_create_dub_sync_checkpoints.sql`. This is not auto-applied by tests (they mock the Supabase client) — it documents the schema the mocks below assume, and is a manual `apply` step for the operator later, same as every other migration in this repo.

- [ ] **Step 2: Write the failing tests for the four new db functions**

Add to `src/lib/db/dub-sync.test.ts`, importing the four new functions/types alongside the existing ones at the top of the file:

```ts
import {
  createEpisode,
  listEpisodes,
  getEpisode,
  updateEpisodeAnchors,
  updateEpisodeTitle,
  createSegment,
  createSegmentsBulk,
  listSegments,
  updateSegment,
  deleteSegment,
  listResyncCheckpoints,
  createResyncCheckpoint,
  updateResyncCheckpoint,
  deleteResyncCheckpoint,
} from './dub-sync'
```

Then add this block near the bottom of the file (after the `deleteSegment` describe block):

```ts
const checkpointRow = {
  id: 'chk-1',
  episode_id: 'ep-1',
  canto_time: 60,
  english_time: 100,
}

function makeListCheckpointsMock(overrides: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(overrides)
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe('listResyncCheckpoints', () => {
  it('returns checkpoints ordered by canto_time', async () => {
    const supabase = makeListCheckpointsMock({ data: [checkpointRow], error: null })
    const result = await listResyncCheckpoints(supabase, 'ep-1')
    expect(result).toEqual([{ id: 'chk-1', episodeId: 'ep-1', cantoTime: 60, englishTime: 100 }])
  })

  it('throws when the query fails', async () => {
    const supabase = makeListCheckpointsMock({ data: null, error: { message: 'boom' } })
    await expect(listResyncCheckpoints(supabase, 'ep-1')).rejects.toThrow(
      'Failed to list resync checkpoints for episode ep-1: boom'
    )
  })
})

function makeCreateCheckpointMock(overrides: { single?: { data: unknown; error: unknown } }) {
  const single = vi.fn().mockResolvedValue(overrides.single ?? { data: checkpointRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  const from = vi.fn().mockReturnValue({ insert })
  return { from } as unknown as SupabaseClient
}

describe('createResyncCheckpoint', () => {
  it('creates a checkpoint and returns it mapped to camelCase', async () => {
    const supabase = makeCreateCheckpointMock({})
    const result = await createResyncCheckpoint(supabase, 'ep-1', { cantoTime: 60, englishTime: 100 })
    expect(result).toEqual({ id: 'chk-1', episodeId: 'ep-1', cantoTime: 60, englishTime: 100 })
  })

  it('throws when the insert fails', async () => {
    const supabase = makeCreateCheckpointMock({ single: { data: null, error: { message: 'boom' } } })
    await expect(createResyncCheckpoint(supabase, 'ep-1', { cantoTime: 60, englishTime: 100 })).rejects.toThrow(
      'Failed to create resync checkpoint for episode ep-1: boom'
    )
  })
})

function makeUpdateCheckpointMock(overrides: { single?: { data: unknown; error: unknown } }) {
  const single = vi.fn().mockResolvedValue(overrides.single ?? { data: checkpointRow, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { from } as unknown as SupabaseClient
}

describe('updateResyncCheckpoint', () => {
  it('returns the updated checkpoint', async () => {
    const supabase = makeUpdateCheckpointMock({ single: { data: { ...checkpointRow, canto_time: 65 }, error: null } })
    const result = await updateResyncCheckpoint(supabase, 'chk-1', { cantoTime: 65 })
    expect(result.cantoTime).toBe(65)
  })

  it('throws when the update fails', async () => {
    const supabase = makeUpdateCheckpointMock({ single: { data: null, error: { message: 'boom' } } })
    await expect(updateResyncCheckpoint(supabase, 'chk-1', { cantoTime: 65 })).rejects.toThrow(
      'Failed to update resync checkpoint chk-1: boom'
    )
  })
})

function makeDeleteCheckpointMock(overrides: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(overrides)
  const del = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ delete: del })
  return { from } as unknown as SupabaseClient
}

describe('deleteResyncCheckpoint', () => {
  it('resolves when the delete succeeds', async () => {
    const supabase = makeDeleteCheckpointMock({ error: null })
    await expect(deleteResyncCheckpoint(supabase, 'chk-1')).resolves.toBeUndefined()
  })

  it('throws when the delete fails', async () => {
    const supabase = makeDeleteCheckpointMock({ error: { message: 'boom' } })
    await expect(deleteResyncCheckpoint(supabase, 'chk-1')).rejects.toThrow(
      'Failed to delete resync checkpoint chk-1: boom'
    )
  })
})
```

- [ ] **Step 2b: Run the tests to verify they fail**

Run: `npx vitest run src/lib/db/dub-sync.test.ts`
Expected: FAIL — `listResyncCheckpoints` (and the other three) are not exported from `./dub-sync`.

- [ ] **Step 3: Implement the four functions in `src/lib/db/dub-sync.ts`**

Append to the end of the file (after `deleteSegment`):

```ts
export interface DubResyncCheckpoint {
  id: string
  episodeId: string
  cantoTime: number
  englishTime: number
}

interface DubResyncCheckpointRow {
  id: string
  episode_id: string
  canto_time: number
  english_time: number
}

function toDubResyncCheckpoint(row: DubResyncCheckpointRow): DubResyncCheckpoint {
  return {
    id: row.id,
    episodeId: row.episode_id,
    cantoTime: row.canto_time,
    englishTime: row.english_time,
  }
}

export interface UpdateResyncCheckpointInput {
  cantoTime?: number
  englishTime?: number
}

export async function listResyncCheckpoints(
  supabase: SupabaseClient,
  episodeId: string
): Promise<DubResyncCheckpoint[]> {
  const { data, error } = await supabase
    .from('dub_sync_checkpoints')
    .select('*')
    .eq('episode_id', episodeId)
    .order('canto_time', { ascending: true })

  if (error) {
    throw new Error(`Failed to list resync checkpoints for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as DubResyncCheckpointRow[]).map(toDubResyncCheckpoint)
}

export async function createResyncCheckpoint(
  supabase: SupabaseClient,
  episodeId: string,
  input: { cantoTime: number; englishTime: number }
): Promise<DubResyncCheckpoint> {
  const { data, error } = await supabase
    .from('dub_sync_checkpoints')
    .insert({ episode_id: episodeId, canto_time: input.cantoTime, english_time: input.englishTime })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create resync checkpoint for episode ${episodeId}: ${error?.message ?? 'unknown error'}`)
  }
  return toDubResyncCheckpoint(data as DubResyncCheckpointRow)
}

export async function updateResyncCheckpoint(
  supabase: SupabaseClient,
  checkpointId: string,
  patch: UpdateResyncCheckpointInput
): Promise<DubResyncCheckpoint> {
  const updates: Record<string, unknown> = {}
  if (patch.cantoTime !== undefined) updates.canto_time = patch.cantoTime
  if (patch.englishTime !== undefined) updates.english_time = patch.englishTime

  const { data, error } = await supabase
    .from('dub_sync_checkpoints')
    .update(updates)
    .eq('id', checkpointId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to update resync checkpoint ${checkpointId}: ${error?.message ?? 'unknown error'}`)
  }
  return toDubResyncCheckpoint(data as DubResyncCheckpointRow)
}

export async function deleteResyncCheckpoint(supabase: SupabaseClient, checkpointId: string): Promise<void> {
  const { error } = await supabase.from('dub_sync_checkpoints').delete().eq('id', checkpointId)
  if (error) {
    throw new Error(`Failed to delete resync checkpoint ${checkpointId}: ${error.message}`)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/db/dub-sync.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_create_dub_sync_checkpoints.sql src/lib/db/dub-sync.ts src/lib/db/dub-sync.test.ts
git commit -m "feat: add resync checkpoints table and db CRUD"
```

---

## Task 2: `englishTimeFor` — constant-shift checkpoint mapping

**Files:**
- Modify: `src/lib/dub-sync/normalize.ts`
- Test: `src/lib/dub-sync/normalize.test.ts`

**Interfaces:**
- Produces: `ResyncCheckpoint { cantoTime: number; englishTime: number }`, and the updated `englishTimeFor(cantoT: number, anchors: EpisodeAnchors, checkpoints: ResyncCheckpoint[] = []): number` — used by Task 4 (validation), Task 5 (`computeResyncTarget`), Task 6 (`cuesToCandidateSegments`), and Task 9 (`admin.tsx`'s spacebar handler).
- Consumes: nothing new — `EpisodeAnchors` already exists in this file.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/dub-sync/normalize.test.ts` (below the existing `describe('englishTimeFor', ...)` block — keep every existing `it` in that block unchanged, they're the zero-checkpoint regression guard):

```ts
describe('englishTimeFor with checkpoints', () => {
  it('behaves exactly like the zero-checkpoint case before the first checkpoint', () => {
    const checkpoints = [{ cantoTime: 60, englishTime: 100 }]
    expect(englishTimeFor(30, anchors, checkpoints)).toBe(englishTimeFor(30, anchors))
  })

  it('applies the checkpoint shift once its cantoTime is reached', () => {
    // base(60) = 20 + (50/100)*200 = 120. Checkpoint says english should actually be 100 there,
    // so shift = 100 - 120 = -20.
    const checkpoints = [{ cantoTime: 60, englishTime: 100 }]
    expect(englishTimeFor(60, anchors, checkpoints)).toBe(100)
    // base(80) = 20 + (70/100)*200 = 160; shift still -20 -> 140.
    expect(englishTimeFor(80, anchors, checkpoints)).toBe(140)
  })

  it('uses the most recent checkpoint once a later one is also crossed', () => {
    const checkpoints = [
      { cantoTime: 60, englishTime: 100 }, // shift -20
      { cantoTime: 90, englishTime: 150 }, // base(90) = 20+(80/100)*200=180, shift = 150-180 = -30
    ]
    // Between the two checkpoints, the first one's shift (-20) still applies.
    expect(englishTimeFor(70, anchors, checkpoints)).toBe(englishTimeFor(70, anchors) - 20)
    // At and after the second, its shift (-30) applies instead.
    expect(englishTimeFor(90, anchors, checkpoints)).toBe(150)
    expect(englishTimeFor(100, anchors, checkpoints)).toBe(englishTimeFor(100, anchors) - 30)
  })

  it('supports a checkpoint correcting backward relative to the base line', () => {
    // base(60) = 120; a checkpoint saying english should be earlier (110) is legitimate.
    const checkpoints = [{ cantoTime: 60, englishTime: 110 }]
    expect(englishTimeFor(60, anchors, checkpoints)).toBe(110)
    expect(englishTimeFor(70, anchors, checkpoints)).toBeLessThan(englishTimeFor(70, anchors))
  })

  it('ignores checkpoint order in the input array (sorts internally)', () => {
    const inOrder = [
      { cantoTime: 60, englishTime: 100 },
      { cantoTime: 90, englishTime: 150 },
    ]
    const reversed = [inOrder[1], inOrder[0]]
    expect(englishTimeFor(95, anchors, reversed)).toBe(englishTimeFor(95, anchors, inOrder))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dub-sync/normalize.test.ts`
Expected: FAIL — `englishTimeFor` doesn't accept a third argument yet (extra checkpoints are silently ignored by the current signature, so the shift-dependent assertions fail).

- [ ] **Step 3: Implement the checkpoint-aware `englishTimeFor`**

Replace the whole body of `src/lib/dub-sync/normalize.ts` with:

```ts
export interface EpisodeAnchors {
  cantoContentStart: number
  cantoContentEnd: number
  englishContentStart: number
  englishContentEnd: number
}

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
// none).
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dub-sync/normalize.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dub-sync/normalize.ts src/lib/dub-sync/normalize.test.ts
git commit -m "feat: apply a constant resync-checkpoint shift in englishTimeFor"
```

---

## Task 3: Checkpoint validation

**Files:**
- Create: `src/lib/dub-sync/resync-checkpoints.ts`
- Test: `src/lib/dub-sync/resync-checkpoints.test.ts`

**Interfaces:**
- Consumes: `EpisodeAnchors`, `ResyncCheckpoint` from `./normalize` (Task 2).
- Produces: `validateCheckpointOrder(anchors: EpisodeAnchors, otherCheckpoints: ResyncCheckpoint[], candidate: ResyncCheckpoint): string | null` — used by Task 4's routes.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dub-sync/resync-checkpoints.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateCheckpointOrder } from './resync-checkpoints'
import type { EpisodeAnchors } from './normalize'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('validateCheckpointOrder', () => {
  it('accepts a checkpoint within the content span with no existing checkpoints', () => {
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 60, englishTime: 100 })).toBeNull()
  })

  it('accepts a checkpoint that does not collide with an existing one', () => {
    const others = [{ cantoTime: 60, englishTime: 100 }]
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 90, englishTime: 150 })).toBeNull()
  })

  it('rejects a checkpoint at or before cantoContentStart', () => {
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 10, englishTime: 20 })).toBe(
      'Checkpoint must fall within the marked content'
    )
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 5, englishTime: 20 })).toBe(
      'Checkpoint must fall within the marked content'
    )
  })

  it('rejects a checkpoint at or after cantoContentEnd', () => {
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 110, englishTime: 200 })).toBe(
      'Checkpoint must fall within the marked content'
    )
  })

  it('rejects a checkpoint colliding with an existing checkpoint\'s exact cantoTime', () => {
    const others = [{ cantoTime: 60, englishTime: 100 }]
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 60, englishTime: 105 })).toBe(
      'A checkpoint already exists at that Cantonese time'
    )
  })

  it('allows editing a checkpoint back onto its own prior cantoTime (excluded from otherCheckpoints)', () => {
    // Simulates a PATCH: the checkpoint being edited must be excluded from otherCheckpoints by
    // the caller before validating, so re-saving it unchanged doesn't collide with itself.
    const others: Array<{ cantoTime: number; englishTime: number }> = []
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 60, englishTime: 100 })).toBeNull()
  })

  it('does not constrain englishTime relative to other checkpoints (backward corrections allowed)', () => {
    const others = [{ cantoTime: 60, englishTime: 150 }]
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 90, englishTime: 100 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dub-sync/resync-checkpoints.test.ts`
Expected: FAIL — the module `./resync-checkpoints` doesn't exist yet.

- [ ] **Step 3: Implement `validateCheckpointOrder`**

Create `src/lib/dub-sync/resync-checkpoints.ts`:

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dub-sync/resync-checkpoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dub-sync/resync-checkpoints.ts src/lib/dub-sync/resync-checkpoints.test.ts
git commit -m "feat: validate resync checkpoint placement"
```

---

## Task 4: Checkpoint API routes

**Files:**
- Create: `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/route.ts`
- Create: `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/route.test.ts`
- Create: `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]/route.ts`
- Create: `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]/route.test.ts`

**Interfaces:**
- Consumes: `getEpisode`, `listResyncCheckpoints`, `createResyncCheckpoint`, `updateResyncCheckpoint`, `deleteResyncCheckpoint` from `@/lib/db/dub-sync` (Task 1); `validateCheckpointOrder` from `@/lib/dub-sync/resync-checkpoints` (Task 3); `readAdminSession` from `@/lib/auth/admin-session`; `createSupabaseServerClient` from `@/lib/supabase/client`.
- Produces: `POST /api/dub-sync/episodes/[episodeId]/checkpoints` → `{ checkpoint }` (201) or `{ error }` (400/401/404); `PATCH`/`DELETE /api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]` → `{ checkpoint }` / `{ ok: true }` — used by Task 9's admin UI.

- [ ] **Step 1: Write the failing tests for the POST route**

Create `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  listResyncCheckpoints: vi.fn(),
  createResyncCheckpoint: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, listResyncCheckpoints, createResyncCheckpoint } from '@/lib/db/dub-sync'

const episodeWithAnchors = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(body: unknown): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/checkpoints', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a checkpoint', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([])
    vi.mocked(createResyncCheckpoint).mockResolvedValue({
      id: 'chk-1',
      episodeId: 'ep-1',
      cantoTime: 60,
      englishTime: 100,
    })

    const response = await POST(await makeRequest({ cantoTime: 60, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })

    expect(response.status).toBe(201)
    expect(createResyncCheckpoint).toHaveBeenCalledWith(expect.anything(), 'ep-1', { cantoTime: 60, englishTime: 100 })
  })

  it('rejects a request missing required fields', async () => {
    const response = await POST(await makeRequest({ cantoTime: 60 }), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(400)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest({ cantoTime: 60, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'missing' }),
    })
    expect(response.status).toBe(404)
  })

  it('returns 400 when anchors are not fully set', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...episodeWithAnchors, englishContentEnd: null })
    const response = await POST(await makeRequest({ cantoTime: 60, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })
    expect(response.status).toBe(400)
  })

  it('returns 400 with the validation message when the checkpoint placement is invalid', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([])
    const response = await POST(await makeRequest({ cantoTime: 5, englishTime: 100 }), {
      params: Promise.resolve({ episodeId: 'ep-1' }),
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Checkpoint must fall within the marked content')
    expect(createResyncCheckpoint).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints', {
      method: 'POST',
      body: JSON.stringify({ cantoTime: 60, englishTime: 100 }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/dub-sync/episodes/\[episodeId\]/checkpoints/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Implement the POST route**

Create `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, listResyncCheckpoints, createResyncCheckpoint } from '@/lib/db/dub-sync'
import { validateCheckpointOrder } from '@/lib/dub-sync/resync-checkpoints'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId } = await params
  const body = await request.json().catch(() => null)
  const cantoTime = typeof body?.cantoTime === 'number' ? body.cantoTime : null
  const englishTime = typeof body?.englishTime === 'number' ? body.englishTime : null

  if (cantoTime === null || englishTime === null) {
    return NextResponse.json({ error: 'cantoTime and englishTime are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  if (
    episode.cantoContentStart === null ||
    episode.cantoContentEnd === null ||
    episode.englishContentStart === null ||
    episode.englishContentEnd === null
  ) {
    return NextResponse.json({ error: 'Episode anchors must be set before adding a checkpoint' }, { status: 400 })
  }

  const anchors: EpisodeAnchors = {
    cantoContentStart: episode.cantoContentStart,
    cantoContentEnd: episode.cantoContentEnd,
    englishContentStart: episode.englishContentStart,
    englishContentEnd: episode.englishContentEnd,
  }

  const existingCheckpoints = await listResyncCheckpoints(supabase, episodeId)
  const validationError = validateCheckpointOrder(anchors, existingCheckpoints, { cantoTime, englishTime })
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const checkpoint = await createResyncCheckpoint(supabase, episodeId, { cantoTime, englishTime })
  return NextResponse.json({ checkpoint }, { status: 201 })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/dub-sync/episodes/\[episodeId\]/checkpoints/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the PATCH/DELETE route**

Create `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  listResyncCheckpoints: vi.fn(),
  updateResyncCheckpoint: vi.fn(),
  deleteResyncCheckpoint: vi.fn(),
}))

import { PATCH, DELETE } from './route'
import { getEpisode, listResyncCheckpoints, updateResyncCheckpoint, deleteResyncCheckpoint } from '@/lib/db/dub-sync'

const params = Promise.resolve({ episodeId: 'ep-1', checkpointId: 'chk-1' })

const episodeWithAnchors = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

const existingCheckpoint = { id: 'chk-1', episodeId: 'ep-1', cantoTime: 60, englishTime: 100 }
const otherCheckpoint = { id: 'chk-2', episodeId: 'ep-1', cantoTime: 90, englishTime: 150 }

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

describe('PATCH /api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the checkpoint, excluding itself from the collision check', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([existingCheckpoint, otherCheckpoint])
    vi.mocked(updateResyncCheckpoint).mockResolvedValue({ ...existingCheckpoint, cantoTime: 65 })

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 65 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(200)
    expect(updateResyncCheckpoint).toHaveBeenCalledWith(expect.anything(), 'chk-1', { cantoTime: 65 })
  })

  it('returns 400 with the validation message when the edit collides with another checkpoint', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([existingCheckpoint, otherCheckpoint])

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 90 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('A checkpoint already exists at that Cantonese time')
    expect(updateResyncCheckpoint).not.toHaveBeenCalled()
  })

  it('returns 404 when the checkpoint being edited is not found', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(listResyncCheckpoints).mockResolvedValue([otherCheckpoint])

    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 65 }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await PATCH(request, { params })
    expect(response.status).toBe(404)
  })

  it('rejects an unauthenticated PATCH', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'PATCH',
      body: JSON.stringify({ cantoTime: 65 }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await PATCH(request, { params })
    expect(response.status).toBe(401)
  })
})

describe('DELETE /api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the checkpoint', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'DELETE',
      headers: { cookie: await adminCookieHeader() },
    })
    const response = await DELETE(request, { params })
    expect(response.status).toBe(200)
    expect(deleteResyncCheckpoint).toHaveBeenCalledWith(expect.anything(), 'chk-1')
  })

  it('rejects an unauthenticated DELETE', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/checkpoints/chk-1', {
      method: 'DELETE',
    })
    const response = await DELETE(request, { params })
    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/dub-sync/episodes/\[episodeId\]/checkpoints/\[checkpointId\]/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 7: Implement the PATCH/DELETE route**

Create `src/app/api/dub-sync/episodes/[episodeId]/checkpoints/[checkpointId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import {
  getEpisode,
  listResyncCheckpoints,
  updateResyncCheckpoint,
  deleteResyncCheckpoint,
  type UpdateResyncCheckpointInput,
} from '@/lib/db/dub-sync'
import { validateCheckpointOrder } from '@/lib/dub-sync/resync-checkpoints'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string; checkpointId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId, checkpointId } = await params
  const body = await request.json().catch(() => null)

  const patch: UpdateResyncCheckpointInput = {}
  if (typeof body?.cantoTime === 'number') patch.cantoTime = body.cantoTime
  if (typeof body?.englishTime === 'number') patch.englishTime = body.englishTime

  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  if (
    episode.cantoContentStart === null ||
    episode.cantoContentEnd === null ||
    episode.englishContentStart === null ||
    episode.englishContentEnd === null
  ) {
    return NextResponse.json({ error: 'Episode anchors must be set before editing a checkpoint' }, { status: 400 })
  }

  const anchors: EpisodeAnchors = {
    cantoContentStart: episode.cantoContentStart,
    cantoContentEnd: episode.cantoContentEnd,
    englishContentStart: episode.englishContentStart,
    englishContentEnd: episode.englishContentEnd,
  }

  const allCheckpoints = await listResyncCheckpoints(supabase, episodeId)
  const current = allCheckpoints.find((checkpoint) => checkpoint.id === checkpointId)
  if (!current) {
    return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 })
  }

  const otherCheckpoints = allCheckpoints.filter((checkpoint) => checkpoint.id !== checkpointId)
  const candidate = { cantoTime: patch.cantoTime ?? current.cantoTime, englishTime: patch.englishTime ?? current.englishTime }
  const validationError = validateCheckpointOrder(anchors, otherCheckpoints, candidate)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const checkpoint = await updateResyncCheckpoint(supabase, checkpointId, patch)
  return NextResponse.json({ checkpoint })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string; checkpointId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { checkpointId } = await params
  const supabase = createSupabaseServerClient()
  await deleteResyncCheckpoint(supabase, checkpointId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/dub-sync/episodes/\[episodeId\]/checkpoints`
Expected: PASS (both route test files, 12 tests total).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/dub-sync/episodes/\[episodeId\]/checkpoints
git commit -m "feat: add resync checkpoint create/update/delete routes"
```

---

## Task 5: Thread checkpoints through the resync interval

**Files:**
- Modify: `src/lib/dub-sync/synced-playback.ts`
- Test: `src/lib/dub-sync/synced-playback.test.ts`

**Interfaces:**
- Consumes: `ResyncCheckpoint`, `englishTimeFor` from `./normalize` (Task 2).
- Produces: `computeResyncTarget(cantoTime: number, englishCurrentTime: number, anchors: EpisodeAnchors, checkpoints: ResyncCheckpoint[] = [], thresholdSeconds: number = 0.75): number | null` — used by Task 9's resync interval in `admin.tsx`.

- [ ] **Step 1: Update the existing test for the new parameter position, and add a checkpoint case**

Replace `src/lib/dub-sync/synced-playback.test.ts` in full:

```ts
import { describe, it, expect } from 'vitest'
import { computeResyncTarget } from './synced-playback'
import type { EpisodeAnchors } from './normalize'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('computeResyncTarget', () => {
  it('returns null when english is already close to the mapped target', () => {
    // cantoTime 60 -> englishTimeFor(60, anchors) = 120
    expect(computeResyncTarget(60, 120.3, anchors)).toBeNull()
  })

  it('returns the mapped target when english has drifted past the threshold', () => {
    expect(computeResyncTarget(60, 130, anchors)).toBe(120)
  })

  it('uses a custom threshold when given one', () => {
    expect(computeResyncTarget(60, 121, anchors, [], 0.5)).toBe(120)
    expect(computeResyncTarget(60, 120.4, anchors, [], 0.5)).toBeNull()
  })

  it('returns null instead of throwing when the anchors are momentarily out of order', () => {
    // e.g. mid-edit, after only one of the two content-end anchors has been re-marked. This runs
    // on a timer during synced playback, so it must never throw into an unhandled interval tick.
    const invertedAnchors: EpisodeAnchors = { ...anchors, cantoContentEnd: 5 }
    expect(computeResyncTarget(60, 120, invertedAnchors)).toBeNull()
  })

  it('resolves against the checkpoint-shifted mapping when checkpoints are given', () => {
    // base(60) = 120; checkpoint says it should be 100 there (shift -20).
    const checkpoints = [{ cantoTime: 60, englishTime: 100 }]
    expect(computeResyncTarget(60, 100.3, anchors, checkpoints)).toBeNull()
    expect(computeResyncTarget(60, 120, anchors, checkpoints)).toBe(100)
  })
})
```

- [ ] **Step 2: Run the tests to verify the new case fails**

Run: `npx vitest run src/lib/dub-sync/synced-playback.test.ts`
Expected: FAIL on the new "resolves against the checkpoint-shifted mapping" case (and the "custom threshold" case, since `computeResyncTarget`'s 4th argument is currently `thresholdSeconds`, not `checkpoints`).

- [ ] **Step 3: Update `computeResyncTarget`**

Replace `src/lib/dub-sync/synced-playback.ts` in full:

```ts
import type { EpisodeAnchors, ResyncCheckpoint } from './normalize'
import { englishTimeFor } from './normalize'

const DEFAULT_THRESHOLD_SECONDS = 0.75

export function computeResyncTarget(
  cantoTime: number,
  englishCurrentTime: number,
  anchors: EpisodeAnchors,
  checkpoints: ResyncCheckpoint[] = [],
  thresholdSeconds: number = DEFAULT_THRESHOLD_SECONDS
): number | null {
  // This runs on a timer during synced playback, so a momentarily-invalid anchor span (e.g.
  // mid-edit, after only one of the two content-end anchors has been re-marked) must not throw
  // into an unhandled interval tick — just skip resyncing until the anchors are valid again.
  let target: number
  try {
    target = englishTimeFor(cantoTime, anchors, checkpoints)
  } catch {
    return null
  }
  return Math.abs(englishCurrentTime - target) > thresholdSeconds ? target : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dub-sync/synced-playback.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dub-sync/synced-playback.ts src/lib/dub-sync/synced-playback.test.ts
git commit -m "feat: resolve the resync target against checkpoint shifts"
```

---

## Task 6: Thread checkpoints through caption-based segment generation

**Files:**
- Modify: `src/lib/dub-sync/candidate-segments.ts`
- Modify: `src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.ts`
- Test: `src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.test.ts`

**Interfaces:**
- Consumes: `ResyncCheckpoint`, `englishTimeFor` from `@/lib/dub-sync/normalize` (Task 2); `listResyncCheckpoints` from `@/lib/db/dub-sync` (Task 1).
- Produces: `cuesToCandidateSegments(cues: TimedCue[], anchors: EpisodeAnchors, checkpoints: ResyncCheckpoint[] = []): CandidateSegment[]`.

- [ ] **Step 1: Update `candidate-segments.ts`**

In `src/lib/dub-sync/candidate-segments.ts`, change the import and function signature:

```ts
import type { EpisodeAnchors, ResyncCheckpoint } from './normalize'
import { englishTimeFor } from './normalize'

export interface TimedCue {
  start: number
  end: number
}

export interface CandidateSegment {
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

export function cuesToCandidateSegments(
  cues: TimedCue[],
  anchors: EpisodeAnchors,
  checkpoints: ResyncCheckpoint[] = []
): CandidateSegment[] {
  return cues
    .filter((cue) => cue.start >= anchors.cantoContentStart && cue.end <= anchors.cantoContentEnd)
    .map((cue) => ({
      cantoStart: cue.start,
      cantoEnd: cue.end,
      englishStart: englishTimeFor(cue.start, anchors, checkpoints),
      englishEnd: englishTimeFor(cue.end, anchors, checkpoints),
    }))
}
```

No test changes needed here — `candidate-segments.test.ts` calls `cuesToCandidateSegments(cues, anchors)` without a third argument, and the new parameter defaults to `[]`, so existing assertions keep passing unmodified. Confirm this by running the existing suite after the change (Step 4 below covers it).

- [ ] **Step 2: Update the existing generate-segments route test's mocks so they still pass**

The route will call `listResyncCheckpoints` in Step 3 below — add it to the existing mock in `src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.test.ts` (otherwise every test in this file breaks with "listResyncCheckpoints is not a function"):

```ts
vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  createSegmentsBulk: vi.fn(),
  listResyncCheckpoints: vi.fn(),
}))
```

And update the import line and the success test to configure it:

```ts
import { getEpisode, createSegmentsBulk, listResyncCheckpoints } from '@/lib/db/dub-sync'
```

In the `'generates and bulk-creates candidate segments from captions'` test, add right after the existing `vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)` line:

```ts
    vi.mocked(listResyncCheckpoints).mockResolvedValue([])
```

- [ ] **Step 3: Run the route test to verify it fails**

Run: `npx vitest run src/app/api/dub-sync/episodes/\[episodeId\]/generate-segments/route.test.ts`
Expected: FAIL — `listResyncCheckpoints` is mocked but the route doesn't call it yet, so `createSegmentsBulk` is still asserted with the un-shifted candidates (this passes trivially since checkpoints are `[]` in the test) — actually expected result here is that the mock addition alone doesn't fail anything yet; the real failure only appears if you additionally assert checkpoint-shifted output. Skip a hard assertion here — this step is about confirming the file still compiles and the pre-existing tests still pass with the new mock present, which they will. Proceed directly to Step 4.

- [ ] **Step 4: Update the generate-segments route**

In `src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.ts`, add `listResyncCheckpoints` to the import and thread it through:

```ts
import { getEpisode, createSegmentsBulk, listResyncCheckpoints } from '@/lib/db/dub-sync'
```

Then, right after the existing `const anchors: EpisodeAnchors = { ... }` block and before the `fetchCantoneseCaptionCues` call, add:

```ts
  const checkpoints = await listResyncCheckpoints(supabase, episodeId)
```

And update the `cuesToCandidateSegments` call to pass it through:

```ts
  const candidates = cuesToCandidateSegments(cues, anchors, checkpoints)
```

- [ ] **Step 5: Run all the affected tests to verify they pass**

Run: `npx vitest run src/lib/dub-sync/candidate-segments.test.ts src/app/api/dub-sync/episodes/\[episodeId\]/generate-segments/route.test.ts`
Expected: PASS (both files, no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dub-sync/candidate-segments.ts src/app/api/dub-sync/episodes/\[episodeId\]/generate-segments/route.ts src/app/api/dub-sync/episodes/\[episodeId\]/generate-segments/route.test.ts
git commit -m "feat: apply resync checkpoints to caption-based segment generation"
```

---

## Task 7: `CheckpointTable` component

**Files:**
- Create: `src/app/dub-sync/admin/checkpoint-table.tsx`
- Test: `src/app/dub-sync/admin/checkpoint-table.test.tsx`

**Interfaces:**
- Consumes: `DubResyncCheckpoint` from `@/lib/db/dub-sync` (Task 1).
- Produces: `<CheckpointTable episodeId={string} checkpoints={DubResyncCheckpoint[]} onUpdate={(checkpoint: DubResyncCheckpoint) => void} onDelete={(checkpointId: string) => void} />` — used by Task 9's `admin.tsx`.

This mirrors `src/app/dub-sync/admin/segment-table.tsx` exactly, minus the label/Play column, with one difference described in the spec: a failed save shows the **server's** error message (from the response body), not a generic string, since the checkpoint validation errors are specific and actionable.

- [ ] **Step 1: Write the failing tests**

Create `src/app/dub-sync/admin/checkpoint-table.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CheckpointTable } from './checkpoint-table'

const checkpoint = { id: 'chk-1', episodeId: 'ep-1', cantoTime: 60, englishTime: 100 }

describe('CheckpointTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders one row per checkpoint with its current values', () => {
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByDisplayValue('60')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('saves a field on blur when its value changed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ checkpoint: { ...checkpoint, cantoTime: 65 } }),
    } as Response)
    const onUpdate = vi.fn()
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={onUpdate} onDelete={vi.fn()} />)

    const cantoTimeInput = screen.getByDisplayValue('60')
    fireEvent.change(cantoTimeInput, { target: { value: '65' } })
    fireEvent.blur(cantoTimeInput)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/checkpoints/chk-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cantoTime: 65 }) })
      )
    )
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ ...checkpoint, cantoTime: 65 }))
  })

  it('does not save when a field is blurred unchanged', async () => {
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    const cantoTimeInput = screen.getByDisplayValue('60')
    fireEvent.blur(cantoTimeInput)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows the server-provided error message and keeps the typed value when a save fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'A checkpoint already exists at that Cantonese time' }),
    } as Response)
    const onUpdate = vi.fn()
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={onUpdate} onDelete={vi.fn()} />)

    const cantoTimeInput = screen.getByDisplayValue('60')
    fireEvent.change(cantoTimeInput, { target: { value: '90' } })
    fireEvent.blur(cantoTimeInput)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A checkpoint already exists at that Cantonese time')
    )
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
  })

  it('deletes a checkpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
    const onDelete = vi.fn()
    render(<CheckpointTable episodeId="ep-1" checkpoints={[checkpoint]} onUpdate={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/checkpoints/chk-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    )
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('chk-1'))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/dub-sync/admin/checkpoint-table.test.tsx`
Expected: FAIL — `./checkpoint-table` doesn't exist yet.

- [ ] **Step 3: Implement `CheckpointTable`**

Create `src/app/dub-sync/admin/checkpoint-table.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { DubResyncCheckpoint } from '@/lib/db/dub-sync'

export interface CheckpointTableProps {
  episodeId: string
  checkpoints: DubResyncCheckpoint[]
  onUpdate: (checkpoint: DubResyncCheckpoint) => void
  onDelete: (checkpointId: string) => void
}

export function CheckpointTable({ episodeId, checkpoints, onUpdate, onDelete }: CheckpointTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">Canto time</th>
          <th className="text-left">English time</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {checkpoints.map((checkpoint) => (
          <CheckpointRow
            key={checkpoint.id}
            episodeId={episodeId}
            checkpoint={checkpoint}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  )
}

interface CheckpointRowProps {
  episodeId: string
  checkpoint: DubResyncCheckpoint
  onUpdate: (checkpoint: DubResyncCheckpoint) => void
  onDelete: (checkpointId: string) => void
}

function CheckpointRow({ episodeId, checkpoint, onUpdate, onDelete }: CheckpointRowProps) {
  const [draft, setDraft] = useState(checkpoint)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previousCheckpoint, setPreviousCheckpoint] = useState(checkpoint)
  if (checkpoint !== previousCheckpoint) {
    setPreviousCheckpoint(checkpoint)
    setDraft(checkpoint)
  }

  async function saveField(field: 'cantoTime' | 'englishTime') {
    if (draft[field] === checkpoint[field]) return
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/checkpoints/${checkpoint.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: draft[field] }),
    })
    const body = await response.json()
    if (response.ok) {
      setSaveError(null)
      onUpdate(body.checkpoint)
    } else {
      // Deliberately don't reset draft to the last-saved value here — the typed value stays
      // visible so the edit isn't lost, and the error makes clear it wasn't saved.
      setSaveError(body.error ?? 'Failed to save — try again')
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/checkpoints/${checkpoint.id}`, {
      method: 'DELETE',
    })
    if (response.ok) onDelete(checkpoint.id)
  }

  return (
    <tr>
      <td>
        <input
          type="number"
          value={draft.cantoTime}
          onChange={(e) => setDraft({ ...draft, cantoTime: Number(e.target.value) })}
          onBlur={() => saveField('cantoTime')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.englishTime}
          onChange={(e) => setDraft({ ...draft, englishTime: Number(e.target.value) })}
          onBlur={() => saveField('englishTime')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <button onClick={handleDelete} className="border p-1 rounded text-sm" title="Delete this checkpoint">
          Delete
        </button>
        {saveError && (
          <p role="alert" className="text-red-600 text-xs mt-1">
            {saveError}
          </p>
        )}
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/dub-sync/admin/checkpoint-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dub-sync/admin/checkpoint-table.tsx src/app/dub-sync/admin/checkpoint-table.test.tsx
git commit -m "feat: add the checkpoint management table"
```

---

## Task 8: Load checkpoints on the admin page

**Files:**
- Modify: `src/app/dub-sync/admin/page.tsx`

**Interfaces:**
- Consumes: `listResyncCheckpoints` from `@/lib/db/dub-sync` (Task 1).
- Produces: an additional `checkpointsByEpisode: Record<string, DubResyncCheckpoint[]>` prop passed into `<Admin>` — consumed by Task 9.

There's no `page.test.tsx` in this directory, so this task has no test file — it's a thin server-side data-loading change, verified by the admin.tsx tests in Task 9 (which supply the prop directly) and by a manual smoke check at the end of Task 9.

- [ ] **Step 1: Update `page.tsx`**

Replace `src/app/dub-sync/admin/page.tsx` in full:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes, listSegments, listResyncCheckpoints, type DubSegment, type DubResyncCheckpoint } from '@/lib/db/dub-sync'
import { readAdminSessionFromCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'
import { Admin } from './admin'

export default async function DubSyncAdminPage() {
  const cookieStore = await cookies()
  const session = await readAdminSessionFromCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  if (!session) {
    redirect('/dub-sync/login')
  }

  const supabase = createSupabaseServerClient()
  const episodes = await listEpisodes(supabase)

  const segmentsByEpisode: Record<string, DubSegment[]> = {}
  const checkpointsByEpisode: Record<string, DubResyncCheckpoint[]> = {}
  for (const episode of episodes) {
    segmentsByEpisode[episode.id] = await listSegments(supabase, episode.id)
    checkpointsByEpisode[episode.id] = await listResyncCheckpoints(supabase, episode.id)
  }

  return <Admin episodes={episodes} segmentsByEpisode={segmentsByEpisode} checkpointsByEpisode={checkpointsByEpisode} />
}
```

- [ ] **Step 2: Run the type checker to verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors — `Admin` doesn't accept `checkpointsByEpisode` yet at this point in the plan, so this step is expected to show one type error here (`checkpointsByEpisode` not assignable to `AdminProps`) until Task 9 adds the prop. Note this and proceed; Task 9 makes it pass. Do not attempt to fix it in this task.

- [ ] **Step 3: Commit**

```bash
git add src/app/dub-sync/admin/page.tsx
git commit -m "feat: load resync checkpoints on the admin page"
```

Note: this commit leaves the repo in a briefly type-error state (Task 9 fixes it immediately after) — acceptable within this plan's task sequencing since both tasks land in the same session before any push. If following strict "every commit is green" discipline, merge Task 8 and Task 9 into a single commit instead; either way, do not skip either task's changes.

---

## Task 9: `admin.tsx` — Resync checkpoint UI, spacebar/resync threading, `englishEnd` guard

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Test: `src/app/dub-sync/admin/admin.test.tsx`

**Interfaces:**
- Consumes: `ResyncCheckpoint` from `@/lib/dub-sync/normalize` (Task 2); `DubResyncCheckpoint` from `@/lib/db/dub-sync` (Task 1); `computeResyncTarget` from `@/lib/dub-sync/synced-playback` (Task 5); `CheckpointTable` from `./checkpoint-table` (Task 7); `checkpointsByEpisode` prop from `page.tsx` (Task 8).
- Produces: the `Admin` component now accepts an optional `checkpointsByEpisode` prop (defaults to `{}`, so every pre-existing call site in `admin.test.tsx` that doesn't pass it keeps working unmodified).

Preview controls inside the adjustment panel are labeled **"Preview play"/"Preview pause"**, not bare "Play"/"Pause" — the segment table already has a "Play" button, and `syncing` already toggles "Play synced"/"Pause synced"; reusing "Play"/"Pause" would make `getByRole('button', { name: 'Play' })` ambiguous once an episode has both segments and is mid-checkpoint-adjustment.

- [ ] **Step 1: Write the new failing tests**

Add this new describe block to `src/app/dub-sync/admin/admin.test.tsx`, placed after the existing `describe('Admin synced playback', ...)` block:

```tsx
describe('Admin resync checkpoints', () => {
  const episodeWithAnchors = {
    ...episodeA,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('disables the Resync checkpoint button until synced playback is running', () => {
    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    expect(screen.getByRole('button', { name: 'Resync checkpoint' })).toBeDisabled()
  })

  it('entering adjustment mode pauses both players and shows the adjustment panel', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.queryByText(/Hold SPACE/)).not.toBeInTheDocument()
  })

  it('nudge buttons shift only the English player\'s current time by the expected delta', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: '+0.5s' }))
    expect(englishHandle.seekTo).toHaveBeenCalledWith(130.5, true)

    fireEvent.click(screen.getByRole('button', { name: '-0.1s' }))
    expect(englishHandle.seekTo).toHaveBeenCalledWith(129.9, true)
  })

  it('Preview play/pause act on both players', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 130)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))
    vi.clearAllMocks()

    fireEvent.click(screen.getByRole('button', { name: 'Preview play' }))
    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Preview pause' }))
    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
  })

  it('Confirm posts the checkpoint, adds it to the table, and returns to the paused state', async () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 100)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ checkpoint: { id: 'chk-1', episodeId: 'ep-a', cantoTime: 60, englishTime: 100 } }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/checkpoints',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ cantoTime: 60, englishTime: 100 }) })
      )
    )
    await waitFor(() => expect(screen.getByDisplayValue('60')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })

  it('keeps the panel open and shows the server error when Confirm fails', async () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 100)
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Checkpoint must fall within the marked content' }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Checkpoint must fall within the marked content')
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('Cancel discards adjustment mode without a request', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 60)
    const englishHandle = makeHandle(() => 100)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resync checkpoint' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })
})
```

Also add one new test to the existing `describe('Admin spacebar marking', ...)` block (after the `'discards the press without posting when release is not after the clamped start'` test), exercising the new `englishEnd <= englishStart` guard:

```tsx
  it('discards the press when a checkpoint jump would make englishEnd <= englishStart', () => {
    const refs = captureRefs()
    const cantoTime = 16
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    // Pressing and releasing at 16 gives pendingStart = 15 (the existing -1s offset). Checkpoint
    // 1 (at 15) shifts englishStart forward to 100; checkpoint 2 (at 16) shifts englishEnd back
    // down to 20 — a straddled backward jump that must discard rather than save cantoEnd < cantoStart.
    const checkpoints = [
      { id: 'chk-1', episodeId: 'ep-a', cantoTime: 15, englishTime: 100 },
      { id: 'chk-2', episodeId: 'ep-a', cantoTime: 16, englishTime: 20 },
    ]

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        checkpointsByEpisode={{ 'ep-a': checkpoints }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL — no "Resync checkpoint" button, no `checkpointsByEpisode` prop, no `englishEnd`/`englishStart` guard yet.

- [ ] **Step 3: Add checkpoint state, handlers, and threading to `admin.tsx`**

In `src/app/dub-sync/admin/admin.tsx`:

1. Update imports at the top of the file:

```ts
import type { DubEpisode, DubSegment, DubResyncCheckpoint } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors, type ResyncCheckpoint } from '@/lib/dub-sync/normalize'
import { computeResyncTarget } from '@/lib/dub-sync/synced-playback'
import { SegmentPlaybackController } from '@/lib/dub-sync/player-controller'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'
import { CheckpointTable } from './checkpoint-table'
import { AnchorFields } from './anchor-fields'
```

2. Update `AdminProps` and the component's destructured props:

```ts
interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
  checkpointsByEpisode?: Record<string, DubResyncCheckpoint[]>
}
```

```ts
export function Admin({
  episodes: initialEpisodes,
  segmentsByEpisode: initialSegments,
  checkpointsByEpisode: initialCheckpoints = {},
}: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [checkpointsByEpisode, setCheckpointsByEpisode] = useState(initialCheckpoints)
```

3. Right after the existing `segments` `useMemo`, add:

```ts
  const checkpoints: ResyncCheckpoint[] = useMemo(
    () => (selectedEpisodeId ? (checkpointsByEpisode[selectedEpisodeId] ?? []) : []),
    [selectedEpisodeId, checkpointsByEpisode]
  )
```

4. In the spacebar-marking `useEffect` (around `handleKeyUp`), thread `checkpoints` through both `englishTimeFor` calls and add the new guard, and add `checkpoints` to the effect's dependency array:

```ts
      const englishStart = englishTimeFor(cantoStart, anchors, checkpoints)
      const englishEnd = englishTimeFor(cantoEnd, anchors, checkpoints)
      if (englishEnd <= englishStart) return
      nextSegmentStartFloorRef.current[episodeId] = cantoEnd
```

```ts
  }, [syncing, episode, anchorsSet, segments, checkpoints])
```

5. In the resync-interval `useEffect`, thread `checkpoints` through `computeResyncTarget` and add it to the dependency array:

```ts
  useEffect(() => {
    if (!syncing || !episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    const interval = setInterval(() => {
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      const englishTime = englishPlayerRef.current?.getCurrentTime() ?? 0
      const target = computeResyncTarget(cantoTime, englishTime, anchors, checkpoints)
      if (target !== null) englishPlayerRef.current?.seekTo(target, true)
    }, 1000)
    return () => clearInterval(interval)
  }, [syncing, episode, anchorsSet, checkpoints])
```

6. Add checkpoint CRUD handlers, right after the existing `handleSegmentDeleted` function:

```ts
  function handleCheckpointUpdated(updated: DubResyncCheckpoint) {
    if (!selectedEpisodeId) return
    setCheckpointsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].map((c) => (c.id === updated.id ? updated : c)),
    }))
  }

  function handleCheckpointDeleted(checkpointId: string) {
    if (!selectedEpisodeId) return
    setCheckpointsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].filter((c) => c.id !== checkpointId),
    }))
  }
```

7. Add the adjustment-mode state and handlers, right after `stopSyncedPlayback`:

```ts
  const [adjustingCheckpoint, setAdjustingCheckpoint] = useState(false)
  const [checkpointError, setCheckpointError] = useState<string | null>(null)

  // Reuses stopSyncedPlayback so entering adjustment gets the same pause + 1x-rate-reset + `syncing:
  // false` behavior for free — which, since both the resync interval and the spacebar listener are
  // already gated on `syncing`, also suspends them without any extra guard here.
  function enterCheckpointAdjustment() {
    if (!syncing) return
    stopSyncedPlayback()
    setCheckpointError(null)
    setAdjustingCheckpoint(true)
  }

  function nudgeEnglish(deltaSeconds: number) {
    const player = englishPlayerRef.current
    if (!player) return
    player.seekTo(player.getCurrentTime() + deltaSeconds, true)
  }

  function previewPlay() {
    cantoPlayerRef.current?.playVideo()
    englishPlayerRef.current?.playVideo()
  }

  function previewPause() {
    cantoPlayerRef.current?.pauseVideo()
    englishPlayerRef.current?.pauseVideo()
  }

  async function confirmCheckpoint() {
    if (!episode) return
    const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishTime = englishPlayerRef.current?.getCurrentTime() ?? 0
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cantoTime, englishTime }),
    })
    const body = await response.json()
    if (!response.ok) {
      setCheckpointError(body.error ?? 'Failed to save checkpoint')
      return
    }
    setCheckpointError(null)
    setCheckpointsByEpisode((current) => ({
      ...current,
      [episode.id]: [...(current[episode.id] ?? []), body.checkpoint].sort(
        (a: ResyncCheckpoint, b: ResyncCheckpoint) => a.cantoTime - b.cantoTime
      ),
    }))
    setAdjustingCheckpoint(false)
  }

  function cancelCheckpointAdjustment() {
    setAdjustingCheckpoint(false)
    setCheckpointError(null)
  }
```

- [ ] **Step 4: Update the JSX**

Add the "Resync checkpoint" button to the existing sync-controls button row:

```tsx
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => (syncing ? stopSyncedPlayback() : startSyncedPlayback())}
                disabled={!anchorsSet}
                className="border p-2 rounded"
                title="Play both videos together, auto-correcting English position to stay in sync"
              >
                {syncing ? 'Pause synced' : 'Play synced'}
              </button>
              <button
                onClick={goToContentStart}
                disabled={!anchorsSet}
                className="border p-2 rounded"
                title="Jump both videos to their marked content start and begin synced playback"
              >
                Go to content start
              </button>
              <button
                onClick={enterCheckpointAdjustment}
                disabled={!syncing}
                className="border p-2 rounded"
                title="Pause and manually correct the English position to fix drift from here onward"
              >
                Resync checkpoint
              </button>
            </div>
```

Replace the existing "Hold SPACE..." block with:

```tsx
            {syncing && !adjustingCheckpoint && (
              <p className="text-gray-500 mb-4">Hold SPACE while a character is speaking, release when they stop.</p>
            )}

            {adjustingCheckpoint && (
              <div className="border p-2 rounded mb-4 flex flex-col gap-2">
                <p className="text-gray-500">Nudge the English video to match, then confirm.</p>
                <div className="flex gap-2">
                  <button onClick={() => nudgeEnglish(-0.5)} className="border p-1 rounded" title="Shift the English video back by 0.5s">
                    -0.5s
                  </button>
                  <button onClick={() => nudgeEnglish(-0.1)} className="border p-1 rounded" title="Shift the English video back by 0.1s">
                    -0.1s
                  </button>
                  <button onClick={() => nudgeEnglish(0.1)} className="border p-1 rounded" title="Shift the English video forward by 0.1s">
                    +0.1s
                  </button>
                  <button onClick={() => nudgeEnglish(0.5)} className="border p-1 rounded" title="Shift the English video forward by 0.5s">
                    +0.5s
                  </button>
                  <button onClick={previewPlay} className="border p-1 rounded" title="Play both videos from their current position to check alignment">
                    Preview play
                  </button>
                  <button onClick={previewPause} className="border p-1 rounded" title="Pause both videos">
                    Preview pause
                  </button>
                  <button onClick={confirmCheckpoint} className="border p-1 rounded" title="Save this correction as a resync checkpoint">
                    Confirm
                  </button>
                  <button onClick={cancelCheckpointAdjustment} className="border p-1 rounded" title="Discard this correction without saving">
                    Cancel
                  </button>
                </div>
                {checkpointError && (
                  <p role="alert" className="text-red-600">
                    {checkpointError}
                  </p>
                )}
              </div>
            )}
```

Add `CheckpointTable` right before `SegmentTable`:

```tsx
            <CheckpointTable
              episodeId={episode.id}
              checkpoints={checkpointsByEpisode[episode.id] ?? []}
              onUpdate={handleCheckpointUpdated}
              onDelete={handleCheckpointDeleted}
            />

            <SegmentTable
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 6: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors (this also resolves the expected Task 8 type error, since `Admin` now accepts `checkpointsByEpisode`).

- [ ] **Step 7: Commit**

```bash
git add src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/admin.test.tsx
git commit -m "feat: add resync checkpoint capture UI and thread checkpoints through marking"
```

---

## Task 10: Hover explanations on every admin page button

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Modify: `src/app/dub-sync/admin/segment-table.tsx`

No new test file — `title` is presentational metadata, not behavior; this task is verified by re-running the full suite (Step 3) to confirm nothing broke, not by new assertions. (`checkpoint-table.tsx`'s Delete button already got its `title` in Task 7.)

- [ ] **Step 1: Add `title` to every remaining button in `admin.tsx`**

Add a `title` attribute to each of these existing buttons (identified by their `onClick` handler, since exact line numbers shifted after Task 9's edits):

| Button (`onClick`) | `title` |
|---|---|
| `markCantoStart` | `"Set this video's content start to the current playback position"` |
| `markCantoEnd` | `"Set this video's content end to the current playback position"` |
| `markEnglishStart` | `"Set this video's content start to the current playback position"` |
| `markEnglishEnd` | `"Set this video's content end to the current playback position"` |
| `runRefineAlignment` | `"Auto-suggest a frame-accurate correction to the English anchors using video similarity"` |
| `applyRefineSuggestion` | `"Use the suggested English times as the new anchors"` |
| `() => setRefineSuggestion(null)` (Dismiss) | `"Discard the suggestion without applying it"` |
| `runGenerateFromCaptions` | `"Create segments automatically from this video's caption timing"` |

(The three sync-controls buttons and the six adjustment-panel buttons already got their `title` in Task 9, Step 4 above.)

- [ ] **Step 2: Add `title` to `segment-table.tsx`'s buttons**

In `src/app/dub-sync/admin/segment-table.tsx`, add to the Play and Delete buttons:

```tsx
        <button onClick={() => onPlay(segment)} className="border p-1 rounded text-sm" title="Play this segment: Cantonese then English">
          Play
        </button>
        <button onClick={handleDelete} className="border p-1 rounded text-sm" title="Delete this segment">
          Delete
        </button>
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — adding a `title` attribute doesn't change any `getByRole`/`getByDisplayValue` query used by existing tests.

- [ ] **Step 4: Commit**

```bash
git add src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/segment-table.tsx
git commit -m "feat: add hover explanations to every admin page button"
```

---

## Final Verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, no regressions anywhere in the repo.

- [ ] **Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Run the linter on touched files**

Run: `npx eslint src/lib/db/dub-sync.ts src/lib/db/dub-sync.test.ts src/lib/dub-sync/normalize.ts src/lib/dub-sync/normalize.test.ts src/lib/dub-sync/resync-checkpoints.ts src/lib/dub-sync/resync-checkpoints.test.ts src/lib/dub-sync/synced-playback.ts src/lib/dub-sync/synced-playback.test.ts src/lib/dub-sync/candidate-segments.ts src/app/api/dub-sync/episodes/\[episodeId\]/checkpoints src/app/api/dub-sync/episodes/\[episodeId\]/generate-segments src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/admin.test.tsx src/app/dub-sync/admin/checkpoint-table.tsx src/app/dub-sync/admin/checkpoint-table.test.tsx src/app/dub-sync/admin/segment-table.tsx src/app/dub-sync/admin/page.tsx`
Expected: no errors.

- [ ] **Run the production build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Manual smoke test** (per this session's established discipline for UI-affecting changes): start the dev server, open `/dub-sync/admin`, select an episode with anchors set, click "Play synced", click "Resync checkpoint", nudge the English video, use Preview play/pause to check it, click Confirm, and verify the new row appears in the checkpoint table and marking (spacebar) resumes correctly afterward via "Play synced". Leave the dev server running for the user to verify themselves before merging, per established session practice.

- [ ] **Remind the operator to apply the new migration** (`supabase/migrations/0008_create_dub_sync_checkpoints.sql`) to their real Supabase project — this repo's migrations are never auto-applied.

## Self-Review Notes

- **Spec coverage:** Interaction/adjustment-mode UI → Task 9. No-continuous-rate-changes constraint → satisfied structurally (no `setPlaybackRate` call added anywhere in this plan). Mapping (constant shift) → Task 2. Validation → Task 3. Guarding a backward jump mid-segment → Task 9 Step 3.4. Persistence → Task 1. Managing checkpoints (editable table) → Task 7. Hover explanations → Task 10 (plus inline in Task 9's new buttons). Data model → Task 1. API → Task 4. Component changes → Tasks 7-9. Testing section's every named test file → covered by the corresponding task above.
- **Placeholder scan:** no TBD/TODO; every step has literal code, not a description of code.
- **Type consistency:** `ResyncCheckpoint { cantoTime, englishTime }` (Task 2) is used identically in Tasks 3, 5, 6, and 9. `DubResyncCheckpoint { id, episodeId, cantoTime, englishTime }` (Task 1) is used identically in Tasks 4, 7, 8, 9 — and satisfies `ResyncCheckpoint` structurally wherever the latter is expected (Task 9's `checkpoints` memo, Task 5's `computeResyncTarget` call), so no mapping/casting is needed between the two. `validateCheckpointOrder`'s signature (Task 3) matches its two call sites in Task 4 exactly (anchors, otherCheckpoints, candidate). `computeResyncTarget`'s new parameter order (`checkpoints` before `thresholdSeconds`, Task 5) is used consistently in Task 9's one call site (which never passes a custom threshold, so it's omitted there).
