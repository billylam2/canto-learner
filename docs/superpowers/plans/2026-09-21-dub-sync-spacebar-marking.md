# Dub Sync Spacebar Marking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Mark segment end" (word-inference-based) with a spacebar press-and-hold interaction — hold space while a character speaks, release when they stop, start offset 0.5s before the press — and retire the entire transcription pipeline that only existed to support the old word-inference approach.

**Architecture:** Add the spacebar interaction to `admin.tsx` first, alongside the existing "Mark segment end" flow (Task 1). Remove the old flow once the new one is proven independently working (Task 2). Then remove the now-fully-unused transcription pipeline top to bottom — UI, route, `transcribe.ts`, its Node-builtin mocking wrappers, the `dub_canto_words` DB layer and table, and the npm dependencies that powered it (Task 3-4).

**Tech Stack:** Next.js App Router, React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-dub-sync-spacebar-marking-design.md`

## Global Constraints

- TDD every step: write the failing test, confirm it fails, implement, confirm it passes, run the full suite + lint, commit.
- Follow this codebase's established `vi.mock`/`fireEvent` conventions already used throughout `admin.test.tsx`.
- No new environment variables — this plan only removes an env var (`DUB_SYNC_GCS_BUCKET`), it adds none.
- Applying the new migration (`0007_drop_dub_canto_words.sql`) is a manual step for the operator, same as every other migration in this repo.

---

### Task 1: Add spacebar-based segment marking

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Modify: `src/app/dub-sync/admin/admin.test.tsx`

**Interfaces:**
- Consumes: `englishTimeFor` from `normalize.ts`, the existing `nextSegmentStartFloorRef`, `syncing`/`episode`/`anchorsSet`/`segments` — all already present in `admin.tsx`.
- Produces: nothing new consumed elsewhere — this task is additive only. The existing "Mark segment end" button and `markSegmentEnd` stay untouched and still work; Task 2 removes them once this is proven working on its own.

This task is purely additive: nothing existing is removed yet, so the app keeps working exactly as it did before, with the new spacebar interaction available alongside the old button.

- [ ] **Step 1: Write the failing tests**

In `src/app/dub-sync/admin/admin.test.tsx`, append this new describe block at the very end of the file (after the closing `})` of `describe('Admin play segment from the segment table', ...)`):

```tsx
describe('Admin spacebar marking', () => {
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

  it('creates a segment from a press-and-release cycle, offsetting the start by 0.5s', async () => {
    const refs = captureRefs()
    let cantoTime = 20
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 19.5,
            cantoEnd: 30,
            englishStart: 39,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 30
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 19.5, cantoEnd: 30, englishStart: 39, englishEnd: 60 }),
        })
      )
    )
  })

  it('clamps the start to the previous segment end when the 0.5s offset would overlap it', async () => {
    const refs = captureRefs()
    let cantoTime = 35.2
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-2',
            episodeId: 'ep-a',
            position: 1,
            label: null,
            cantoStart: 35,
            cantoEnd: 45,
            englishStart: 70,
            englishEnd: 90,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{
          'ep-a': [
            { id: 'seg-1', episodeId: 'ep-a', position: 0, label: null, cantoStart: 15, cantoEnd: 35, englishStart: 30, englishEnd: 70 },
          ],
        }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    // Pressed at 35.2, so an unclamped -0.5s offset would be 34.7 — before the previous
    // segment's end (35). The clamp must keep the start at 35, not 34.7.
    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 45
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 35, cantoEnd: 45, englishStart: 70, englishEnd: 90 }),
        })
      )
    )
  })

  it('discards the press without posting when release is not after the clamped start', () => {
    const refs = captureRefs()
    let cantoTime = 5 // before the content-start anchor (10)
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    // pressed at 5, -0.5 = 4.5, but the floor (content start) clamps pendingStart to 10
    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 8 // released before the clamped start (10)
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not restart the pending start on a key-repeat keydown while held', async () => {
    const refs = captureRefs()
    let cantoTime = 20
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 19.5,
            cantoEnd: 30,
            englishStart: 39,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' }) // real press at 20 -> pendingStart 19.5
    cantoTime = 25
    // OS auto-repeat while the key stays held must be ignored, not recompute pendingStart from 25
    fireEvent.keyDown(window, { code: 'Space', repeat: true })
    cantoTime = 30
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          body: JSON.stringify({ cantoStart: 19.5, cantoEnd: 30, englishStart: 39, englishEnd: 60 }),
        })
      )
    )
  })

  it('does nothing when synced playback is not running', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 20)
    const englishHandle = makeHandle(() => 0)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    // deliberately do not click "Play synced"

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL — pressing/releasing space does nothing yet (no listeners attached), so `fetch` is never called in the first four new tests.

- [ ] **Step 3: Add the spacebar marking effect to `admin.tsx`**

Add `pendingSegmentStartRef` right after the existing `nextSegmentStartFloorRef` declaration:

```tsx
  const nextSegmentStartFloorRef = useRef<Record<string, number>>({})
  const pendingSegmentStartRef = useRef<number | null>(null)
```

Add this new `useEffect`, directly after the existing resync-interval `useEffect` and before `async function markSegmentEnd() {`:

```tsx
  // Space bar is the marking key while synced playback is running: hold it down for as long as a
  // character/narrator is speaking, release when they stop. The segment's end is the release
  // time; its start is half a second before the press (reaction-time offset), clamped to the
  // same synchronous per-episode floor `nextSegmentStartFloorRef` already tracks, so it can never
  // overlap the previous segment even if the press lands a little early.
  useEffect(() => {
    if (!syncing || !episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      const floor =
        nextSegmentStartFloorRef.current[episode.id] ??
        (segments.length > 0 ? segments[segments.length - 1].cantoEnd : anchors.cantoContentStart)
      pendingSegmentStartRef.current = Math.max(cantoTime - 0.5, floor)
    }

    async function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space' || pendingSegmentStartRef.current === null) return
      event.preventDefault()
      const cantoStart = pendingSegmentStartRef.current
      pendingSegmentStartRef.current = null

      const cantoEnd = cantoPlayerRef.current?.getCurrentTime() ?? 0
      if (cantoEnd <= cantoStart) return

      const englishStart = englishTimeFor(cantoStart, anchors)
      const englishEnd = englishTimeFor(cantoEnd, anchors)
      nextSegmentStartFloorRef.current[episode.id] = cantoEnd

      const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cantoStart, cantoEnd, englishStart, englishEnd }),
      })
      if (!response.ok) {
        nextSegmentStartFloorRef.current[episode.id] = cantoStart
        return
      }
      const { segment } = await response.json()
      setSegmentsByEpisode((current) => ({
        ...current,
        [episode.id]: [...(current[episode.id] ?? []), segment],
      }))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [syncing, episode, anchorsSet, segments])
```

Add the instruction line in the JSX, directly after the `<div className="flex gap-2 mb-4">...Play synced.../Go to content start.../Mark segment end...</div>` block closes (i.e. right before `{transcribeState.error && (`):

```tsx
            {syncing && (
              <p className="text-gray-500 mb-4">Hold SPACE while a character is speaking, release when they stop.</p>
            )}

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: PASS, all tests including the 5 new ones (21 total).

- [ ] **Step 5: Run the full suite and lint, then commit**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors.

```bash
git add src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/admin.test.tsx
git commit -m "feat: add spacebar press-and-hold segment marking"
```

---

### Task 2: Remove the old click-based "Mark segment end"

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Modify: `src/app/dub-sync/admin/admin.test.tsx`
- Delete: `src/lib/dub-sync/next-word-start.ts`
- Delete: `src/lib/dub-sync/next-word-start.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — pure removal. Spacebar marking (Task 1) is now the only way to create a segment manually; `nextSegmentStartFloorRef` stays (spacebar marking uses it).

Now that Task 1's spacebar marking has its own passing tests proving it works independently, the old button and its word-inference logic can come out safely.

- [ ] **Step 1: Remove `markSegmentEnd` and its button from `admin.tsx`**

Remove the entire `markSegmentEnd` function (from `async function markSegmentEnd() {` through its closing `}`, immediately before `const [captionsError, ...`).

Remove the `findNextWordStart` import line:

```tsx
import { findNextWordStart } from '@/lib/dub-sync/next-word-start'
```

Remove the now-unused `cantoWords` derived constant (it was only read inside `markSegmentEnd`):

```tsx
  const cantoWords = selectedEpisodeId ? (cantoWordsByEpisode[selectedEpisodeId] ?? []) : []
```

Remove the "Mark segment end" button from the JSX:

```tsx
              <button onClick={markSegmentEnd} disabled={!anchorsSet} className="border p-2 rounded">
                Mark segment end
              </button>
```

- [ ] **Step 2: Remove the old click-based tests from `admin.test.tsx`**

Remove the entire `describe('Admin mark segment end', () => { ... })` block (all 3 tests: the word-inference test, the fallback test, and the rapid-press race test — all specifically exercised the now-removed `markSegmentEnd`/click flow, which Task 1's `describe('Admin spacebar marking', ...)` tests already replaced).

- [ ] **Step 3: Delete the now-fully-unused next-word-start files**

```bash
rm src/lib/dub-sync/next-word-start.ts src/lib/dub-sync/next-word-start.test.ts
```

- [ ] **Step 4: Run the full suite and lint to verify nothing else referenced the removed code**

Run: `npm test && npm run lint`
Expected: all tests pass (the count drops by 3 removed tests plus `next-word-start.test.ts`'s 5 tests; TypeScript will fail to compile if anything still references `findNextWordStart` or `markSegmentEnd`), no lint errors (in particular, no unused-variable warnings for the removed `cantoWords`).

- [ ] **Step 5: Commit**

```bash
git add -A src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/admin.test.tsx src/lib/dub-sync/next-word-start.ts src/lib/dub-sync/next-word-start.test.ts
git commit -m "refactor: remove click-based Mark segment end and word-inference lookup"
```

---

### Task 3: Retire the transcription pipeline

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Modify: `src/app/dub-sync/admin/admin.test.tsx`
- Modify: `src/app/dub-sync/admin/page.tsx`
- Modify: `src/lib/db/dub-sync.ts`
- Modify: `src/lib/db/dub-sync.test.ts`
- Delete: `src/app/api/dub-sync/episodes/[episodeId]/transcribe-canto/route.ts`
- Delete: `src/app/api/dub-sync/episodes/[episodeId]/transcribe-canto/route.test.ts`
- Delete: `src/lib/dub-sync/transcribe.ts`
- Delete: `src/lib/dub-sync/transcribe.test.ts`
- Delete: `src/lib/dub-sync/spawn-process.ts`
- Delete: `src/lib/dub-sync/fs-process.ts`
- Create: `supabase/migrations/0007_drop_dub_canto_words.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — `AdminProps` drops `cantoWordsByEpisode` entirely; nothing else in the app references `CantoWord`, `replaceCantoWords`, `listCantoWords`, or anything in `transcribe.ts` after this task.

Spacebar marking (Tasks 1-2) doesn't use the transcribed word data at all, so nothing in the app calls any of this anymore — it's now a fully dead subsystem, safe to remove top to bottom in one task (splitting it further wouldn't leave any more useful an intermediate state).

- [ ] **Step 1: Replace `admin.tsx` with its final form**

Replace the full contents of `src/app/dub-sync/admin/admin.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { computeResyncTarget } from '@/lib/dub-sync/synced-playback'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'
import { AnchorFields } from './anchor-fields'

interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
}

function hasAllAnchors(episode: DubEpisode): episode is DubEpisode & EpisodeAnchors {
  return (
    episode.cantoContentStart !== null &&
    episode.cantoContentEnd !== null &&
    episode.englishContentStart !== null &&
    episode.englishContentEnd !== null
  )
}

export function Admin({ episodes: initialEpisodes, segmentsByEpisode: initialSegments }: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodes[0]?.id ?? null)

  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)
  // segmentsByEpisode only updates once a POST's response comes back, so pressing space again
  // before that response lands would otherwise compute the same start twice (rapid marking is
  // exactly how this feature is meant to be used). This ref advances synchronously, before the
  // request even goes out, so each press always sees the immediately preceding one's end
  // regardless of network timing.
  const nextSegmentStartFloorRef = useRef<Record<string, number>>({})
  const pendingSegmentStartRef = useRef<number | null>(null)

  const episode = episodes.find((candidate) => candidate.id === selectedEpisodeId) ?? null
  const segments = selectedEpisodeId ? (segmentsByEpisode[selectedEpisodeId] ?? []) : []

  function handleEpisodeCreated(newEpisode: DubEpisode) {
    setEpisodes((current) => [...current, newEpisode])
    setSegmentsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
    setSelectedEpisodeId(newEpisode.id)
  }

  function updateEpisodeInPlace(updated: DubEpisode) {
    setEpisodes((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)))
  }

  async function saveAnchors(next: {
    cantoContentStart: number
    cantoContentEnd: number
    englishContentStart: number
    englishContentEnd: number
  }) {
    if (!episode) return
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (response.ok) {
      const { episode: updated } = await response.json()
      updateEpisodeInPlace(updated)
    }
  }

  function markCantoStart() {
    if (!episode) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: time,
      cantoContentEnd: episode.cantoContentEnd ?? time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markCantoEnd() {
    if (!episode) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markEnglishStart() {
    if (!episode) return
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: time,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function editCantoStart(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: value,
      cantoContentEnd: episode.cantoContentEnd ?? value,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function editCantoEnd(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: value,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function editEnglishStart(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: value,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function editEnglishEnd(value: number) {
    if (!episode) return
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: value,
    })
  }

  function markEnglishEnd() {
    if (!episode) return
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: time,
    })
  }

  const anchorsSet = episode ? hasAllAnchors(episode) : false

  function handleSegmentUpdated(updated: DubSegment) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].map((s) => (s.id === updated.id ? updated : s)),
    }))
  }

  function handleSegmentDeleted(segmentId: string) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].filter((s) => s.id !== segmentId),
    }))
    // Force the next marked segment to recompute the floor from fresh segments state, rather
    // than keep the deleted segment's end around.
    delete nextSegmentStartFloorRef.current[selectedEpisodeId]
  }

  const [syncing, setSyncing] = useState(false)

  function startSyncedPlayback() {
    if (!episode || !anchorsSet) return
    cantoPlayerRef.current?.playVideo()
    englishPlayerRef.current?.playVideo()
    setSyncing(true)
  }

  function stopSyncedPlayback() {
    cantoPlayerRef.current?.pauseVideo()
    englishPlayerRef.current?.pauseVideo()
    setSyncing(false)
  }

  function goToContentStart() {
    if (!episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    cantoPlayerRef.current?.seekTo(anchors.cantoContentStart, true)
    englishPlayerRef.current?.seekTo(anchors.englishContentStart, true)
    startSyncedPlayback()
  }

  function playSegment(segment: DubSegment) {
    if (!anchorsSet) return
    cantoPlayerRef.current?.seekTo(segment.cantoStart, true)
    englishPlayerRef.current?.seekTo(segment.englishStart, true)
    startSyncedPlayback()
  }

  useEffect(() => {
    if (!syncing || !episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    const interval = setInterval(() => {
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      const englishTime = englishPlayerRef.current?.getCurrentTime() ?? 0
      const target = computeResyncTarget(cantoTime, englishTime, anchors)
      if (target !== null) englishPlayerRef.current?.seekTo(target, true)
    }, 1000)
    return () => clearInterval(interval)
  }, [syncing, episode, anchorsSet])

  // Space bar is the marking key while synced playback is running: hold it down for as long as a
  // character/narrator is speaking, release when they stop. The segment's end is the release
  // time; its start is half a second before the press (reaction-time offset), clamped to the
  // same synchronous per-episode floor `nextSegmentStartFloorRef` already tracks, so it can never
  // overlap the previous segment even if the press lands a little early.
  useEffect(() => {
    if (!syncing || !episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      const cantoTime = cantoPlayerRef.current?.getCurrentTime() ?? 0
      const floor =
        nextSegmentStartFloorRef.current[episode.id] ??
        (segments.length > 0 ? segments[segments.length - 1].cantoEnd : anchors.cantoContentStart)
      pendingSegmentStartRef.current = Math.max(cantoTime - 0.5, floor)
    }

    async function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space' || pendingSegmentStartRef.current === null) return
      event.preventDefault()
      const cantoStart = pendingSegmentStartRef.current
      pendingSegmentStartRef.current = null

      const cantoEnd = cantoPlayerRef.current?.getCurrentTime() ?? 0
      if (cantoEnd <= cantoStart) return

      const englishStart = englishTimeFor(cantoStart, anchors)
      const englishEnd = englishTimeFor(cantoEnd, anchors)
      nextSegmentStartFloorRef.current[episode.id] = cantoEnd

      const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cantoStart, cantoEnd, englishStart, englishEnd }),
      })
      if (!response.ok) {
        nextSegmentStartFloorRef.current[episode.id] = cantoStart
        return
      }
      const { segment } = await response.json()
      setSegmentsByEpisode((current) => ({
        ...current,
        [episode.id]: [...(current[episode.id] ?? []), segment],
      }))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [syncing, episode, anchorsSet, segments])

  const [captionsError, setCaptionsError] = useState<string | null>(null)

  async function runGenerateFromCaptions() {
    if (!episode) return
    setCaptionsError(null)
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/generate-segments`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setCaptionsError(body.error ?? 'Failed to generate segments')
      return
    }
    setSegmentsByEpisode((current) => ({
      ...current,
      [episode.id]: [...(current[episode.id] ?? []), ...body.segments],
    }))
  }

  return (
    <div className="flex gap-6 p-6">
      <aside className="w-64 flex flex-col gap-2">
        <h2 className="font-bold">Episodes</h2>
        <ul className="flex flex-col gap-1">
          {episodes.map((candidate) => (
            <li key={candidate.id}>
              <button
                onClick={() => setSelectedEpisodeId(candidate.id)}
                className={`text-left w-full p-1 rounded ${candidate.id === selectedEpisodeId ? 'bg-gray-200' : ''}`}
              >
                {candidate.title}
              </button>
            </li>
          ))}
        </ul>
        <NewEpisodeForm onCreated={handleEpisodeCreated} />
      </aside>

      <main className="flex-1">
        {!episode ? (
          <p className="text-gray-500">No episode selected.</p>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-4">{episode.title}</h1>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <YoutubePlayer ref={cantoPlayerRef} videoId={episode.cantoneseVideoId} elementId="canto-player" />
                <div className="flex gap-2 mt-2">
                  <button onClick={markCantoStart} className="border p-1 rounded">
                    Mark content start
                  </button>
                  <button onClick={markCantoEnd} className="border p-1 rounded">
                    Mark content end
                  </button>
                </div>
                <AnchorFields
                  start={episode.cantoContentStart}
                  end={episode.cantoContentEnd}
                  onSaveStart={editCantoStart}
                  onSaveEnd={editCantoEnd}
                />
              </div>
              <div>
                <YoutubePlayer ref={englishPlayerRef} videoId={episode.englishVideoId} elementId="english-player" />
                <div className="flex gap-2 mt-2">
                  <button onClick={markEnglishStart} className="border p-1 rounded">
                    Mark content start
                  </button>
                  <button onClick={markEnglishEnd} className="border p-1 rounded">
                    Mark content end
                  </button>
                </div>
                <AnchorFields
                  start={episode.englishContentStart}
                  end={episode.englishContentEnd}
                  onSaveStart={editEnglishStart}
                  onSaveEnd={editEnglishEnd}
                />
              </div>
            </div>
            {!anchorsSet && <p className="text-gray-500 mb-4">Set anchors before marking segments.</p>}

            <div className="flex gap-2 mb-4">
              <button onClick={runGenerateFromCaptions} disabled={!anchorsSet} className="border p-2 rounded">
                Generate from captions
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={syncing ? stopSyncedPlayback : startSyncedPlayback}
                disabled={!anchorsSet}
                className="border p-2 rounded"
              >
                {syncing ? 'Pause synced' : 'Play synced'}
              </button>
              <button onClick={goToContentStart} disabled={!anchorsSet} className="border p-2 rounded">
                Go to content start
              </button>
            </div>

            {syncing && (
              <p className="text-gray-500 mb-4">Hold SPACE while a character is speaking, release when they stop.</p>
            )}

            {captionsError && (
              <p role="alert" className="text-red-600 mb-4">
                {captionsError}
              </p>
            )}

            <SegmentTable
              episodeId={episode.id}
              segments={segments}
              onUpdate={handleSegmentUpdated}
              onDelete={handleSegmentDeleted}
              onPlay={playSegment}
            />
          </>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL — the test file still passes `cantoWordsByEpisode` to every `<Admin ...>` render, which `AdminProps` no longer declares (TypeScript error), and the "Admin transcribe canto..." describe block references a button that no longer exists.

- [ ] **Step 3: Replace `admin.test.tsx` with its final form**

Replace the full contents of `src/app/dub-sync/admin/admin.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

import { Admin } from './admin'
import { YoutubePlayer } from '@/components/dub-sync/youtube-player'

const episodeA = {
  id: 'ep-a',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-a',
  englishVideoId: 'eng-a',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}
const episodeB = {
  id: 'ep-b',
  title: 'The Playgroup',
  cantoneseVideoId: 'canto-b',
  englishVideoId: 'eng-b',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

function captureRefs() {
  let cantoRef: React.Ref<unknown> | undefined
  let englishRef: React.Ref<unknown> | undefined
  vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
    const ref = (props as { ref?: React.Ref<unknown> }).ref
    if (elementId === 'canto-player') cantoRef = ref
    if (elementId === 'english-player') englishRef = ref
    return <div data-testid={`player-${elementId}`} />
  })
  return {
    assign(cantoHandle: unknown, englishHandle: unknown) {
      if (cantoRef && typeof cantoRef === 'object' && 'current' in cantoRef) {
        ;(cantoRef as { current: unknown }).current = cantoHandle
      }
      if (englishRef && typeof englishRef === 'object' && 'current' in englishRef) {
        ;(englishRef as { current: unknown }).current = englishHandle
      }
    },
  }
}

function makeHandle(getCurrentTime: () => number) {
  return { seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getCurrentTime }
}

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists episodes and switches the selected panel without navigating', () => {
    render(<Admin episodes={[episodeA, episodeB]} segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }} />)

    expect(screen.getByRole('heading', { name: 'Muddy Puddles' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'The Playgroup' }))

    expect(screen.getByRole('heading', { name: 'The Playgroup' })).toBeInTheDocument()
  })

  it('selects a newly created episode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeB, id: 'ep-c', title: 'New Episode' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Episode' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'c' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Episode' })).toBeInTheDocument())
  })

  it('marks the canto content start from the canto player and saves it', async () => {
    const refs = captureRefs()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 8 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(makeHandle(() => 8), makeHandle(() => 0))

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'PATCH' }))
    )
  })

  it('shows the current anchor values in editable fields, defaulting to 0 when null', () => {
    const episodeWithSomeAnchors = { ...episodeA, cantoContentStart: 29.3, englishContentEnd: 300 }
    render(<Admin episodes={[episodeWithSomeAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)

    const startInputs = screen.getAllByLabelText('Start')
    const endInputs = screen.getAllByLabelText('End')
    expect(startInputs[0]).toHaveValue(29.3) // canto
    expect(endInputs[0]).toHaveValue(0) // canto, unset
    expect(startInputs[1]).toHaveValue(0) // english, unset
    expect(endInputs[1]).toHaveValue(300) // english
  })

  it('saves a typed anchor value on blur', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 25 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    const cantoStartInput = screen.getAllByLabelText('Start')[0]
    fireEvent.change(cantoStartInput, { target: { value: '25' } })
    fireEvent.blur(cantoStartInput)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            cantoContentStart: 25,
            cantoContentEnd: 25,
            englishContentStart: 0,
            englishContentEnd: 0,
          }),
        })
      )
    )
  })
})

describe('Admin generate from captions', () => {
  const episodeWithAnchors = {
    ...episodeA,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId }: { elementId: string }) => (
      <div data-testid={`player-${elementId}`} />
    ))
  })

  it('runs generate from captions and appends returned segments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            segments: [
              {
                id: 'seg-2',
                episodeId: 'ep-a',
                position: 0,
                label: null,
                cantoStart: 10,
                cantoEnd: 15,
                englishStart: 20,
                englishEnd: 26,
              },
            ],
          }),
      })
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate from captions' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/generate-segments',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})

describe('Admin synced playback', () => {
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays both videos when starting synced playback, and shows a pause toggle', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
  })

  it('pauses both videos when stopping synced playback', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause synced' }))

    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })

  it('seeks both players to the content-start anchors and starts synced playback', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Go to content start' }))

    expect(cantoHandle.seekTo).toHaveBeenCalledWith(10, true)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(20, true)
    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
  })

  it('re-seeks the english player only once drift exceeds the threshold', () => {
    vi.useFakeTimers()
    const refs = captureRefs()
    let cantoTime = 60 // englishTimeFor(60, anchors) = 120
    let englishTime = 120.2 // within the 0.75s threshold
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => englishTime)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).not.toHaveBeenCalled()

    englishTime = 130
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(120, true)
  })
})

describe('Admin play segment from the segment table', () => {
  const episodeWithAnchors = {
    ...episodeA,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }
  const existingSegment = {
    id: 'seg-1',
    episodeId: 'ep-a',
    position: 0,
    label: null,
    cantoStart: 15,
    cantoEnd: 35,
    englishStart: 30,
    englishEnd: 70,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('seeks both players to the segment and starts synced playback when Play is clicked', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 0)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [existingSegment] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(cantoHandle.seekTo).toHaveBeenCalledWith(15, true)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(30, true)
    expect(cantoHandle.playVideo).toHaveBeenCalled()
    expect(englishHandle.playVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause synced' })).toBeInTheDocument()
  })
})

describe('Admin spacebar marking', () => {
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

  it('creates a segment from a press-and-release cycle, offsetting the start by 0.5s', async () => {
    const refs = captureRefs()
    let cantoTime = 20
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 19.5,
            cantoEnd: 30,
            englishStart: 39,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 30
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 19.5, cantoEnd: 30, englishStart: 39, englishEnd: 60 }),
        })
      )
    )
  })

  it('clamps the start to the previous segment end when the 0.5s offset would overlap it', async () => {
    const refs = captureRefs()
    let cantoTime = 35.2
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-2',
            episodeId: 'ep-a',
            position: 1,
            label: null,
            cantoStart: 35,
            cantoEnd: 45,
            englishStart: 70,
            englishEnd: 90,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{
          'ep-a': [
            { id: 'seg-1', episodeId: 'ep-a', position: 0, label: null, cantoStart: 15, cantoEnd: 35, englishStart: 30, englishEnd: 70 },
          ],
        }}
      />
    )
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 45
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 35, cantoEnd: 45, englishStart: 70, englishEnd: 90 }),
        })
      )
    )
  })

  it('discards the press without posting when release is not after the clamped start', () => {
    const refs = captureRefs()
    let cantoTime = 5
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 8
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not restart the pending start on a key-repeat keydown while held', async () => {
    const refs = captureRefs()
    let cantoTime = 20
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => 0)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 19.5,
            cantoEnd: 30,
            englishStart: 39,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)
    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))

    fireEvent.keyDown(window, { code: 'Space' })
    cantoTime = 25
    fireEvent.keyDown(window, { code: 'Space', repeat: true })
    cantoTime = 30
    fireEvent.keyUp(window, { code: 'Space' })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          body: JSON.stringify({ cantoStart: 19.5, cantoEnd: 30, englishStart: 39, englishEnd: 60 }),
        })
      )
    )
  })

  it('does nothing when synced playback is not running', () => {
    const refs = captureRefs()
    const cantoHandle = makeHandle(() => 20)
    const englishHandle = makeHandle(() => 0)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(cantoHandle, englishHandle)

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyUp(window, { code: 'Space' })

    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Update `page.tsx`**

Replace the full contents of `src/app/dub-sync/admin/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes, listSegments, type DubSegment } from '@/lib/db/dub-sync'
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
  for (const episode of episodes) {
    segmentsByEpisode[episode.id] = await listSegments(supabase, episode.id)
  }

  return <Admin episodes={episodes} segmentsByEpisode={segmentsByEpisode} />
}
```

- [ ] **Step 6: Remove the `CantoWord` section from `db/dub-sync.ts`**

Truncate `src/lib/db/dub-sync.ts` to end after `deleteSegment`'s closing brace (currently line 260 — everything from `export interface CantoWord {` onward is removed):

```ts
export async function deleteSegment(supabase: SupabaseClient, segmentId: string): Promise<void> {
  const { error } = await supabase.from('dub_segments').delete().eq('id', segmentId)
  if (error) {
    throw new Error(`Failed to delete segment ${segmentId}: ${error.message}`)
  }
}
```

That's the new end of the file.

- [ ] **Step 7: Remove the `CantoWord` tests and update the import in `db/dub-sync.test.ts`**

Change the import block at the top:

```ts
import {
  createEpisode,
  listEpisodes,
  getEpisode,
  updateEpisodeAnchors,
  createSegment,
  createSegmentsBulk,
  listSegments,
  updateSegment,
  deleteSegment,
} from './dub-sync'
```

Truncate the file to end after `describe('deleteSegment', ...)`'s closing `})` (currently line 328 — everything from `function makeReplaceCantoWordsMock(` onward is removed).

- [ ] **Step 8: Delete the transcription pipeline files**

```bash
rm -rf "src/app/api/dub-sync/episodes/[episodeId]/transcribe-canto"
rm src/lib/dub-sync/transcribe.ts src/lib/dub-sync/transcribe.test.ts
rm src/lib/dub-sync/spawn-process.ts src/lib/dub-sync/fs-process.ts
```

- [ ] **Step 9: Write the migration that drops the table**

Create `supabase/migrations/0007_drop_dub_canto_words.sql`:

```sql
drop table if exists dub_canto_words;
```

- [ ] **Step 10: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (the deleted files' tests are gone; TypeScript will fail to compile if anything still references `CantoWord`, `replaceCantoWords`, `listCantoWords`, `transcribeWords`, `downloadAudio`, or anything from the deleted route), no lint errors.

- [ ] **Step 11: Commit**

```bash
git add -A src/app/dub-sync/admin src/lib/db/dub-sync.ts src/lib/db/dub-sync.test.ts src/app/api/dub-sync/episodes/\[episodeId\]/transcribe-canto src/lib/dub-sync/transcribe.ts src/lib/dub-sync/transcribe.test.ts src/lib/dub-sync/spawn-process.ts src/lib/dub-sync/fs-process.ts supabase/migrations/0007_drop_dub_canto_words.sql
git commit -m "refactor: retire the transcription pipeline entirely"
```

---

### Task 4: Remove now-unused dependencies and docs

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — this is dependency/doc cleanup only, verified by the final full-suite run.

- [ ] **Step 1: Remove the now-unused Google Cloud dependencies**

Run: `npm uninstall @google-cloud/speech @google-cloud/storage`
Expected: `package.json` and `package-lock.json` update to remove both packages and their now-unused transitive dependencies.

- [ ] **Step 2: Update the README's "Dub Sync admin tool" section**

In `README.md`, replace:

```markdown
- **[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)** installed and on `PATH` wherever `npm run dev` (or however the app is served) runs — required by the "Transcribe Cantonese" button, which downloads the Cantonese video's audio temporarily (never kept or served) to transcribe it via Google Cloud Speech-to-Text (word timestamps only — speaker diarization was tried and dropped; Google doesn't support it for Cantonese at all, and it proved unreliable for English too). Also requires the Speech-to-Text API enabled on the same `GOOGLE_CLOUD_PROJECT` already used for text-to-speech.
- **`DUB_SYNC_GCS_BUCKET`** in `.env.local` — the name of a Google Cloud Storage bucket (e.g. created via `gsutil mb gs://<bucket-name>` or the console) that the transcription pipeline can read and write. Speech-to-Text requires audio longer than its inline-request limit to be passed as a `gs://` URI rather than embedded directly, so the downloaded audio is uploaded there temporarily and deleted again once transcription finishes — never kept or served.
- Apply `supabase/migrations/0006_create_dub_canto_words.sql` — adds the table that stores each episode's transcribed Cantonese word timestamps (used by the "Transcribe Cantonese" button to infer segment start times).
```

with:

```markdown
- Segments are marked by hand: set each video's content-start/content-end anchors, then use "Play synced" and hold SPACE while a character is speaking (release when they stop) to mark a segment. No audio download or transcription is involved.
```

The full "Dub Sync admin tool" section should now read:

```markdown
## Dub Sync admin tool

A separate, password-gated personal tool at `/dub-sync/admin` for building the Cantonese/English clip-pairing data used by `/dub-sync`. Requires one thing beyond the main app's setup:

- **`DUB_SYNC_ADMIN_PASSWORD`** in `.env.local` — the single shared password for `/dub-sync/admin`, `/dub-sync/login`, and the episode/segment-editing API routes. The player at `/dub-sync/<episodeId>` itself stays open, unauthenticated.
- Segments are marked by hand: set each video's content-start/content-end anchors, then use "Play synced" and hold SPACE while a character is speaking (release when they stop) to mark a segment. No audio download or transcription is involved.
```

- [ ] **Step 3: Remove `DUB_SYNC_GCS_BUCKET` from `.env.local.example`**

Replace the full contents of `.env.local.example`:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
GOOGLE_CLOUD_PROJECT=
DUB_SYNC_ADMIN_PASSWORD=
```

- [ ] **Step 4: Run the full suite, type-check, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests pass. `npx tsc --noEmit` may report pre-existing errors unrelated to this change (confirmed pre-existing earlier this branch, in `*.test.tsx` files unrelated to dub-sync and in `src/lib/dub-sync/transcribe.ts` — the latter no longer exists after Task 3, so that specific pre-existing error is gone too); confirm no *new* errors. `npm run lint` must be fully clean.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json README.md .env.local.example
git commit -m "chore: remove unused Google Cloud dependencies and update docs"
```

---

## After All Tasks: Manual QA

Before finishing the branch, start the dev server and manually verify in the browser:
1. Set content-start/content-end anchors on a fresh (or existing) test episode.
2. Click "Play synced", then hold SPACE for a couple of seconds while the Cantonese narrator/character is speaking, release, and confirm a new segment appears in the table with a sensible (non-overlapping, start-before-end) range.
3. Repeat several times in a row without pausing playback — confirm no segment shares a start with another, and none has start after end (the exact defect that motivated this whole rework).
4. Confirm space does nothing when "Play synced" hasn't been clicked (e.g. while typing in the new-episode form).
5. Confirm "Generate from captions", "Go to content start", editable anchors, and per-segment "Play" all still work (unaffected by this plan).
