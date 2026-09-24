# Dub Sync Waveform Marking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, toggleable segment-marking mode to the dub-sync admin tool — drag directly over each dub's audio waveform to mark line boundaries visually, instead of relying on reaction-time-compensated spacebar timing.

**Architecture:** A local-only audio pipeline (recovered `yt-dlp` download + new `ffmpeg`-based PCM decode, no Google Cloud) produces a compact peak array per video, stored per episode. The admin page renders two independently-controlled `<canvas>` waveform tracks; dragging on either sets that track's own start/end in local "pending" state, and only once both sides are confirmed does a normal segment POST fire — identical in shape to the existing spacebar/caption flows.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres), `yt-dlp` + `ffmpeg` (already installed, no new system deps), React + HTML Canvas (no new npm dependencies), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-dub-sync-waveform-marking-design.md`

## Global Constraints

- No Google Cloud Speech-to-Text or Storage — this pipeline is entirely local (`yt-dlp` download → `ffmpeg` PCM decode → peak computation → delete temp file).
- Peaks are normalized amplitude values (0..1), one per 50ms bucket (`BUCKET_MS = 50`, `SAMPLE_RATE = 8000` in `waveform.ts`).
- Independent per-track marking: a track's drag sets only that track's own two timestamps. `englishTimeFor` is used solely as a navigation aid (auto-scrolling the English view), never to compute a saved value.
- A segment is only POSTed once both tracks have a confirmed pending selection; nothing is saved from a single side alone.
- The spacebar-vs-waveform mode toggle is session-only React state (`markingMode`), not persisted — no schema change for it.
- Follow this repo's snake_case-row / camelCase-domain-type convention in `src/lib/db/dub-sync.ts`, and its admin-session-gated route pattern (401 via `readAdminSession`) in every new route.

---

## Task 1: Recover audio-download infrastructure

**Files:**
- Create: `src/lib/dub-sync/spawn-process.ts`
- Create: `src/lib/dub-sync/fs-process.ts`
- Create: `src/lib/dub-sync/download-audio.ts`
- Test: `src/lib/dub-sync/download-audio.test.ts`

**Interfaces:**
- Produces: `downloadAudio(videoId: string): Promise<string>` (resolves to a temp `.mp3` file path), `deleteAudioFile(filePath: string): Promise<void>` — both from `src/lib/dub-sync/download-audio.ts`, used by Task 4's API route.

This recovers (unchanged) the `yt-dlp`-download half of the transcription pipeline removed in commit `98a9676` — **not** the Speech-to-Text/GCS half, which this feature doesn't need. Recovered from `git show 98a9676~1:src/lib/dub-sync/transcribe.ts`.

- [ ] **Step 1: Recover the two Node-builtin-wrapping files**

Create `src/lib/dub-sync/spawn-process.ts`:

```ts
// Node built-in modules are unreliable to mock directly in this project's Vitest setup — a
// direct `vi.mock('node:child_process', ...)` in a test silently failed to intercept calls,
// running the real binary instead. Re-exporting through this thin wrapper makes it a plain user
// module, which mocks reliably.
export { spawn } from 'node:child_process'
```

Create `src/lib/dub-sync/fs-process.ts`:

```ts
// See spawn-process.ts — Node built-in modules are unreliable to mock directly in this
// project's Vitest setup. Re-exporting through this thin wrapper makes it a plain user module,
// which mocks reliably.
export { unlink } from 'node:fs/promises'
```

- [ ] **Step 2: Write the failing tests for `downloadAudio`/`deleteAudioFile`**

Create `src/lib/dub-sync/download-audio.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('./spawn-process', () => ({
  spawn: vi.fn(),
}))
vi.mock('./fs-process', () => ({
  unlink: vi.fn(),
}))

import { spawn } from './spawn-process'
import { unlink } from './fs-process'
import { downloadAudio, deleteAudioFile } from './download-audio'

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
  child.stderr = new EventEmitter()
  return child
}

describe('downloadAudio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves with a temp file path when yt-dlp exits successfully', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('close', 0)

    const path = await promise
    expect(path).toMatch(/video-1/)
    expect(path.endsWith('.mp3')).toBe(true)
  })

  it('requests 16kHz mono output', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('close', 0)
    await promise

    const args = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(args).toEqual(expect.arrayContaining(['--postprocessor-args', 'ExtractAudio:-ar 16000 -ac 1']))
  })

  it('rejects with the captured stderr when yt-dlp exits with a non-zero code', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.stderr.emit('data', Buffer.from('video unavailable'))
    child.emit('close', 1)

    await expect(promise).rejects.toThrow('video unavailable')
  })

  it('rejects with a clear message when yt-dlp cannot be started', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow('yt-dlp not found or failed to start')
  })
})

describe('deleteAudioFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('unlinks the given path', async () => {
    vi.mocked(unlink).mockResolvedValue(undefined)
    await deleteAudioFile('/tmp/foo.mp3')
    expect(unlink).toHaveBeenCalledWith('/tmp/foo.mp3')
  })

  it('does not throw when the file is already gone', async () => {
    vi.mocked(unlink).mockRejectedValue(new Error('ENOENT'))
    await expect(deleteAudioFile('/tmp/foo.mp3')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dub-sync/download-audio.test.ts`
Expected: FAIL — `./download-audio` doesn't exist yet.

- [ ] **Step 4: Implement `download-audio.ts`**

Create `src/lib/dub-sync/download-audio.ts`:

```ts
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { spawn } from './spawn-process'
import { unlink } from './fs-process'

export async function downloadAudio(videoId: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `dub-sync-${videoId}-${randomUUID()}.mp3`)

  await new Promise<void>((resolve, reject) => {
    const child = spawn('yt-dlp', [
      '-x',
      '--audio-format',
      'mp3',
      '--postprocessor-args',
      'ExtractAudio:-ar 16000 -ac 1',
      '-o',
      outputPath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ])

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`yt-dlp not found or failed to start: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`))
      }
    })
  })

  return outputPath
}

export async function deleteAudioFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => {})
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dub-sync/download-audio.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dub-sync/spawn-process.ts src/lib/dub-sync/fs-process.ts src/lib/dub-sync/download-audio.ts src/lib/dub-sync/download-audio.test.ts
git commit -m "feat: recover yt-dlp audio download for waveform generation"
```

---

## Task 2: Waveform peak extraction

**Files:**
- Create: `src/lib/dub-sync/waveform.ts`
- Test: `src/lib/dub-sync/waveform.test.ts`

**Interfaces:**
- Consumes: `spawn` from `./spawn-process` (Task 1).
- Produces: `extractWaveformPeaks(audioFilePath: string): Promise<number[]>` — used by Task 4's API route.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dub-sync/waveform.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('./spawn-process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from './spawn-process'
import { extractWaveformPeaks } from './waveform'

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

// Builds a little-endian s16le PCM buffer from plain sample values (-32768..32767).
function pcmBuffer(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2)
  samples.forEach((sample, i) => buffer.writeInt16LE(sample, i * 2))
  return buffer
}

describe('extractWaveformPeaks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes one normalized peak per 50ms bucket at the 8000Hz sample rate', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    // 8000Hz * 0.05s = 400 samples per bucket. Two buckets: first loud (32768 => 1.0), second silent (0).
    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.stdout.emit('data', pcmBuffer([...Array(400).fill(32767), ...Array(400).fill(0)]))
    child.emit('close', 0)

    const peaks = await promise
    expect(peaks).toHaveLength(2)
    expect(peaks[0]).toBeCloseTo(1.0, 2)
    expect(peaks[1]).toBe(0)
  })

  it('requests mono 8000Hz signed 16-bit PCM from ffmpeg', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.stdout.emit('data', pcmBuffer(Array(400).fill(0)))
    child.emit('close', 0)
    await promise

    const args = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(args).toEqual(expect.arrayContaining(['-f', 's16le', '-ar', '8000', '-ac', '1']))
  })

  it('rejects with the captured stderr when ffmpeg exits with a non-zero code', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.stderr.emit('data', Buffer.from('invalid data'))
    child.emit('close', 1)

    await expect(promise).rejects.toThrow('invalid data')
  })

  it('rejects with a clear message when ffmpeg cannot be started', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow('ffmpeg not found or failed to start')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dub-sync/waveform.test.ts`
Expected: FAIL — `./waveform` doesn't exist yet.

- [ ] **Step 3: Implement `waveform.ts`**

Create `src/lib/dub-sync/waveform.ts`:

```ts
import { spawn } from './spawn-process'

// Amplitude-only peaks don't need speech-quality sample rate — keeps ffmpeg's output (and thus
// how much PCM this has to buffer in memory) small.
export const SAMPLE_RATE = 8000
export const BUCKET_MS = 50

export async function extractWaveformPeaks(audioFilePath: string): Promise<number[]> {
  const pcm = await decodeToPcm(audioFilePath)
  const samplesPerBucket = Math.round((SAMPLE_RATE * BUCKET_MS) / 1000)
  const peaks: number[] = []
  for (let i = 0; i < pcm.length; i += samplesPerBucket) {
    let maxAbs = 0
    for (let j = i; j < Math.min(i + samplesPerBucket, pcm.length); j++) {
      maxAbs = Math.max(maxAbs, Math.abs(pcm[j]))
    }
    peaks.push(Math.round((maxAbs / 32768) * 1000) / 1000)
  }
  return peaks
}

function decodeToPcm(audioFilePath: string): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-i',
      audioFilePath,
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      '1',
      'pipe:1',
    ])
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`ffmpeg not found or failed to start: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        return
      }
      const buffer = Buffer.concat(chunks)
      resolve(new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2))
    })
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dub-sync/waveform.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dub-sync/waveform.ts src/lib/dub-sync/waveform.test.ts
git commit -m "feat: extract waveform amplitude peaks via ffmpeg"
```

---

## Task 3: Data model — migration + db CRUD for waveforms

**Files:**
- Create: `supabase/migrations/0009_create_dub_sync_waveforms.sql`
- Modify: `src/lib/db/dub-sync.ts`
- Test: `src/lib/db/dub-sync.test.ts`

**Interfaces:**
- Produces: `DubWaveform { id: string; episodeId: string; language: 'canto' | 'english'; peaks: number[] }`, `listWaveforms(supabase, episodeId): Promise<DubWaveform[]>`, `replaceWaveforms(supabase, episodeId, waveforms: Array<{ language: 'canto' | 'english'; peaks: number[] }>): Promise<DubWaveform[]>` — used by Task 4's route and Task 5's page.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_create_dub_sync_waveforms.sql`:

```sql
create table dub_sync_waveforms (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references dub_episodes(id) on delete cascade,
  language text not null check (language in ('canto', 'english')),
  peaks jsonb not null,
  created_at timestamptz not null default now(),
  unique (episode_id, language)
);

alter table dub_sync_waveforms enable row level security;
```

This is not auto-applied by tests (they mock the Supabase client) — applying it is a manual step for the operator later, same as every other migration in this repo.

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/db/dub-sync.test.ts`, importing the new functions/types alongside the existing ones at the top of the file:

```ts
  listWaveforms,
  replaceWaveforms,
```

(added to the existing `import { ... } from './dub-sync'` block)

Then add this block near the bottom of the file:

```ts
const waveformRow = {
  id: 'wf-1',
  episode_id: 'ep-1',
  language: 'canto',
  peaks: [0.1, 0.5, 0.9],
}

function makeListWaveformsMock(overrides: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(overrides)
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe('listWaveforms', () => {
  it('returns waveforms mapped to camelCase', async () => {
    const supabase = makeListWaveformsMock({ data: [waveformRow], error: null })
    const result = await listWaveforms(supabase, 'ep-1')
    expect(result).toEqual([{ id: 'wf-1', episodeId: 'ep-1', language: 'canto', peaks: [0.1, 0.5, 0.9] }])
  })

  it('throws when the query fails', async () => {
    const supabase = makeListWaveformsMock({ data: null, error: { message: 'boom' } })
    await expect(listWaveforms(supabase, 'ep-1')).rejects.toThrow('Failed to list waveforms for episode ep-1: boom')
  })
})

function makeReplaceWaveformsMock(overrides: { insertResult: { data: unknown; error: unknown } }) {
  const deleteEq = vi.fn().mockResolvedValue({ error: null })
  const del = vi.fn().mockReturnValue({ eq: deleteEq })
  const insertSelect = vi.fn().mockResolvedValue(overrides.insertResult)
  const insert = vi.fn().mockReturnValue({ select: insertSelect })
  const from = vi.fn().mockReturnValue({ delete: del, insert })
  return { from, del, deleteEq, insert } as unknown as SupabaseClient & {
    del: typeof del
    deleteEq: typeof deleteEq
    insert: typeof insert
  }
}

describe('replaceWaveforms', () => {
  it('deletes existing waveforms for the episode, then bulk-inserts the new ones', async () => {
    const supabase = makeReplaceWaveformsMock({
      insertResult: {
        data: [waveformRow, { ...waveformRow, id: 'wf-2', language: 'english', peaks: [0.2, 0.4] }],
        error: null,
      },
    })
    const result = await replaceWaveforms(supabase, 'ep-1', [
      { language: 'canto', peaks: [0.1, 0.5, 0.9] },
      { language: 'english', peaks: [0.2, 0.4] },
    ])
    expect(supabase.deleteEq).toHaveBeenCalledWith('episode_id', 'ep-1')
    expect(result).toHaveLength(2)
    expect(result[1].language).toBe('english')
  })

  it('throws when the insert fails', async () => {
    const supabase = makeReplaceWaveformsMock({ insertResult: { data: null, error: { message: 'boom' } } })
    await expect(
      replaceWaveforms(supabase, 'ep-1', [{ language: 'canto', peaks: [0.1] }])
    ).rejects.toThrow('Failed to replace waveforms for episode ep-1: boom')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/db/dub-sync.test.ts`
Expected: FAIL — `listWaveforms`/`replaceWaveforms` are not exported from `./dub-sync`.

- [ ] **Step 4: Implement the two functions in `src/lib/db/dub-sync.ts`**

Append to the end of the file:

```ts
export interface DubWaveform {
  id: string
  episodeId: string
  language: 'canto' | 'english'
  peaks: number[]
}

interface DubWaveformRow {
  id: string
  episode_id: string
  language: 'canto' | 'english'
  peaks: number[]
}

function toDubWaveform(row: DubWaveformRow): DubWaveform {
  return {
    id: row.id,
    episodeId: row.episode_id,
    language: row.language,
    peaks: row.peaks,
  }
}

export async function listWaveforms(supabase: SupabaseClient, episodeId: string): Promise<DubWaveform[]> {
  const { data, error } = await supabase.from('dub_sync_waveforms').select('*').eq('episode_id', episodeId)

  if (error) {
    throw new Error(`Failed to list waveforms for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as DubWaveformRow[]).map(toDubWaveform)
}

export async function replaceWaveforms(
  supabase: SupabaseClient,
  episodeId: string,
  waveforms: Array<{ language: 'canto' | 'english'; peaks: number[] }>
): Promise<DubWaveform[]> {
  const { error: deleteError } = await supabase.from('dub_sync_waveforms').delete().eq('episode_id', episodeId)
  if (deleteError) {
    throw new Error(`Failed to replace waveforms for episode ${episodeId}: ${deleteError.message}`)
  }

  const rows = waveforms.map((waveform) => ({
    episode_id: episodeId,
    language: waveform.language,
    peaks: waveform.peaks,
  }))
  const { data, error } = await supabase.from('dub_sync_waveforms').insert(rows).select('*')

  if (error) {
    throw new Error(`Failed to replace waveforms for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as DubWaveformRow[]).map(toDubWaveform)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/db/dub-sync.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_create_dub_sync_waveforms.sql src/lib/db/dub-sync.ts src/lib/db/dub-sync.test.ts
git commit -m "feat: add waveforms table and db CRUD"
```

---

## Task 4: Waveform generation API route

**Files:**
- Create: `src/app/api/dub-sync/episodes/[episodeId]/waveforms/route.ts`
- Create: `src/app/api/dub-sync/episodes/[episodeId]/waveforms/route.test.ts`

**Interfaces:**
- Consumes: `getEpisode`, `replaceWaveforms` from `@/lib/db/dub-sync` (Tasks 3); `downloadAudio`, `deleteAudioFile` from `@/lib/dub-sync/download-audio` (Task 1); `extractWaveformPeaks` from `@/lib/dub-sync/waveform` (Task 2); `readAdminSession` from `@/lib/auth/admin-session`; `createSupabaseServerClient` from `@/lib/supabase/client`.
- Produces: `POST /api/dub-sync/episodes/[episodeId]/waveforms` → `{ waveforms }` (201) or `{ error }` (401/404/502) — used by Task 8's "Generate waveforms" button.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/dub-sync/episodes/[episodeId]/waveforms/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  replaceWaveforms: vi.fn(),
}))

vi.mock('@/lib/dub-sync/download-audio', () => ({
  downloadAudio: vi.fn(),
  deleteAudioFile: vi.fn(),
}))

vi.mock('@/lib/dub-sync/waveform', () => ({
  extractWaveformPeaks: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, replaceWaveforms } from '@/lib/db/dub-sync'
import { downloadAudio, deleteAudioFile } from '@/lib/dub-sync/download-audio'
import { extractWaveformPeaks } from '@/lib/dub-sync/waveform'

const episode = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/waveforms', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/waveforms', () => {
  beforeEach(() => vi.clearAllMocks())

  it('downloads both videos, extracts peaks, and replaces the stored waveforms', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockImplementation(async (videoId) => `/tmp/${videoId}.mp3`)
    vi.mocked(extractWaveformPeaks).mockImplementation(async (path) =>
      path.includes('canto-123') ? [0.1, 0.2] : [0.3, 0.4]
    )
    vi.mocked(replaceWaveforms).mockResolvedValue([
      { id: 'wf-1', episodeId: 'ep-1', language: 'canto', peaks: [0.1, 0.2] },
      { id: 'wf-2', episodeId: 'ep-1', language: 'english', peaks: [0.3, 0.4] },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    expect(downloadAudio).toHaveBeenCalledWith('canto-123')
    expect(downloadAudio).toHaveBeenCalledWith('eng-456')
    expect(replaceWaveforms).toHaveBeenCalledWith(expect.anything(), 'ep-1', [
      { language: 'canto', peaks: [0.1, 0.2] },
      { language: 'english', peaks: [0.3, 0.4] },
    ])
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
    const body = await response.json()
    expect(body.waveforms).toHaveLength(2)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 502 and still cleans up when audio download fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockRejectedValue(new Error('yt-dlp exited with code 1'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toMatch(/canto-123/)
    expect(replaceWaveforms).not.toHaveBeenCalled()
  })

  it('returns 502 when peak extraction fails, and still deletes the downloaded file', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockResolvedValue('/tmp/canto-123.mp3')
    vi.mocked(extractWaveformPeaks).mockRejectedValue(new Error('ffmpeg exited with code 1'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/waveforms', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/dub-sync/episodes/\[episodeId\]/waveforms/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Implement the route**

Create `src/app/api/dub-sync/episodes/[episodeId]/waveforms/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, replaceWaveforms } from '@/lib/db/dub-sync'
import { downloadAudio, deleteAudioFile } from '@/lib/dub-sync/download-audio'
import { extractWaveformPeaks } from '@/lib/dub-sync/waveform'
import { readAdminSession } from '@/lib/auth/admin-session'

async function extractPeaksFor(videoId: string, label: string): Promise<number[]> {
  let audioPath: string
  try {
    audioPath = await downloadAudio(videoId)
  } catch (error) {
    throw new Error(`${label} audio (${videoId}) failed: ${(error as Error).message}`)
  }
  try {
    return await extractWaveformPeaks(audioPath)
  } catch (error) {
    throw new Error(`${label} audio (${videoId}) failed: ${(error as Error).message}`)
  } finally {
    await deleteAudioFile(audioPath)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId } = await params
  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  let cantoPeaks: number[]
  let englishPeaks: number[]
  try {
    cantoPeaks = await extractPeaksFor(episode.cantoneseVideoId, 'Cantonese')
    englishPeaks = await extractPeaksFor(episode.englishVideoId, 'English')
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 })
  }

  const waveforms = await replaceWaveforms(supabase, episodeId, [
    { language: 'canto', peaks: cantoPeaks },
    { language: 'english', peaks: englishPeaks },
  ])
  return NextResponse.json({ waveforms }, { status: 201 })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/dub-sync/episodes/\[episodeId\]/waveforms/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dub-sync/episodes/\[episodeId\]/waveforms
git commit -m "feat: add waveform generation route"
```

---

## Task 5: Load waveforms on the admin page

**Files:**
- Modify: `src/app/dub-sync/admin/page.tsx`

**Interfaces:**
- Consumes: `listWaveforms` from `@/lib/db/dub-sync` (Task 3).
- Produces: an additional `waveformsByEpisode: Record<string, DubWaveform[]>` prop passed into `<Admin>` — consumed by Task 8.

No test file for this task — it's a thin server-side data-loading change (same as the equivalent checkpoints-loading task earlier in this project), verified by the admin.tsx tests in Task 8 (which supply the prop directly) and the manual smoke check at the end of this plan.

- [ ] **Step 1: Update `page.tsx`**

Replace `src/app/dub-sync/admin/page.tsx` in full:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import {
  listEpisodes,
  listSegments,
  listResyncCheckpoints,
  listWaveforms,
  type DubSegment,
  type DubResyncCheckpoint,
  type DubWaveform,
} from '@/lib/db/dub-sync'
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
  const waveformsByEpisode: Record<string, DubWaveform[]> = {}
  for (const episode of episodes) {
    segmentsByEpisode[episode.id] = await listSegments(supabase, episode.id)
    checkpointsByEpisode[episode.id] = await listResyncCheckpoints(supabase, episode.id)
    waveformsByEpisode[episode.id] = await listWaveforms(supabase, episode.id)
  }

  return (
    <Admin
      episodes={episodes}
      segmentsByEpisode={segmentsByEpisode}
      checkpointsByEpisode={checkpointsByEpisode}
      waveformsByEpisode={waveformsByEpisode}
    />
  )
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: one expected error here — `Admin` doesn't accept `waveformsByEpisode` yet (`AdminProps` isn't updated until Task 8). Note it and proceed; Task 8 resolves it.

- [ ] **Step 3: Commit**

```bash
git add src/app/dub-sync/admin/page.tsx
git commit -m "feat: load waveforms on the admin page"
```

Note: this commit leaves the repo in a briefly type-error state (Task 8 fixes it immediately after), same as the equivalent checkpoints-loading task earlier in this project's history — acceptable within this plan's task sequencing since both tasks land in the same session before any push.

---

## Task 6: `WaveformTrack` component

**Files:**
- Create: `src/app/dub-sync/admin/waveform-track.tsx`
- Test: `src/app/dub-sync/admin/waveform-track.test.tsx`

**Interfaces:**
- Produces: `<WaveformTrack peaks bucketMs width height pixelsPerSecond viewStartSeconds onViewStartChange markedRanges pendingSelection onSelectionDrafted color />` — a single, reusable waveform widget that knows nothing about Cantonese/English or segments. Used twice by Task 7's `WaveformMarking`.

A **controlled** component: `viewStartSeconds` and `pendingSelection` are owned by the parent and passed in; this component only ever proposes changes via its two callback props, never mutates its own view state. Renders on `<canvas>`; scroll/trackpad pans (`onViewStartChange`), click-drag on the canvas drafts a selection (`onSelectionDrafted`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/dub-sync/admin/waveform-track.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WaveformTrack } from './waveform-track'

function mockCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    set fillStyle(_: string) {},
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 90,
    width: 800,
    height: 90,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return ctx
}

const defaultProps = {
  peaks: [0.1, 0.5, 0.9, 0.3, 0.2],
  bucketMs: 50,
  width: 800,
  height: 90,
  pixelsPerSecond: 60,
  viewStartSeconds: 0,
  onViewStartChange: vi.fn(),
  markedRanges: [],
  pendingSelection: null,
  onSelectionDrafted: vi.fn(),
  color: '#4ade80',
}

describe('WaveformTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCanvas()
  })

  it('draws without throwing', () => {
    expect(() => render(<WaveformTrack {...defaultProps} />)).not.toThrow()
  })

  it('drafts a selection from a click-drag, in seconds relative to the view', () => {
    const onSelectionDrafted = vi.fn()
    const { container } = render(<WaveformTrack {...defaultProps} onSelectionDrafted={onSelectionDrafted} />)
    const canvas = container.querySelector('canvas')!

    // pixelsPerSecond=60, viewStartSeconds=0 -> x=60 is 1.0s, x=180 is 3.0s
    fireEvent.mouseDown(canvas, { clientX: 60 })
    fireEvent.mouseMove(window, { clientX: 180 })
    fireEvent.mouseUp(window)

    expect(onSelectionDrafted).toHaveBeenCalledTimes(1)
    const [start, end] = onSelectionDrafted.mock.calls[0]
    expect(start).toBeCloseTo(1.0, 5)
    expect(end).toBeCloseTo(3.0, 5)
  })

  it('does not draft a selection for a plain click with no real drag', () => {
    const onSelectionDrafted = vi.fn()
    const { container } = render(<WaveformTrack {...defaultProps} onSelectionDrafted={onSelectionDrafted} />)
    const canvas = container.querySelector('canvas')!

    fireEvent.mouseDown(canvas, { clientX: 100 })
    fireEvent.mouseUp(window)

    expect(onSelectionDrafted).not.toHaveBeenCalled()
  })

  it('reports a panned view start on horizontal scroll', () => {
    const onViewStartChange = vi.fn()
    const { container } = render(<WaveformTrack {...defaultProps} onViewStartChange={onViewStartChange} />)
    const canvas = container.querySelector('canvas')!

    // pixelsPerSecond=60, so a 60px deltaX pans by 1 second.
    fireEvent.wheel(canvas, { deltaX: 60, deltaY: 0 })

    expect(onViewStartChange).toHaveBeenCalledWith(1)
  })

  it('does not pan before the start of the track', () => {
    const onViewStartChange = vi.fn()
    const { container } = render(
      <WaveformTrack {...defaultProps} viewStartSeconds={0.5} onViewStartChange={onViewStartChange} />
    )
    const canvas = container.querySelector('canvas')!

    fireEvent.wheel(canvas, { deltaX: -60, deltaY: 0 }) // would go to -0.5s

    expect(onViewStartChange).toHaveBeenCalledWith(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/dub-sync/admin/waveform-track.test.tsx`
Expected: FAIL — `./waveform-track` doesn't exist yet.

- [ ] **Step 3: Implement `waveform-track.tsx`**

Create `src/app/dub-sync/admin/waveform-track.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'

export interface WaveformRange {
  start: number
  end: number
}

export interface WaveformTrackProps {
  peaks: number[]
  bucketMs: number
  width: number
  height: number
  pixelsPerSecond: number
  viewStartSeconds: number
  onViewStartChange: (viewStartSeconds: number) => void
  markedRanges: WaveformRange[]
  pendingSelection: WaveformRange | null
  onSelectionDrafted: (start: number, end: number) => void
  color: string
}

export function WaveformTrack({
  peaks,
  bucketMs,
  width,
  height,
  pixelsPerSecond,
  viewStartSeconds,
  onViewStartChange,
  markedRanges,
  pendingSelection,
  onSelectionDrafted,
  color,
}: WaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragStartSeconds, setDragStartSeconds] = useState<number | null>(null)
  const [dragCurrentSeconds, setDragCurrentSeconds] = useState<number | null>(null)

  function secondsAtClientX(clientX: number): number {
    const rect = canvasRef.current!.getBoundingClientRect()
    return viewStartSeconds + (clientX - rect.left) / pixelsPerSecond
  }

  function rangeToPixels(range: WaveformRange): { x1: number; x2: number } {
    return {
      x1: (range.start - viewStartSeconds) * pixelsPerSecond,
      x2: (range.end - viewStartSeconds) * pixelsPerSecond,
    }
  }

  // Draws on every prop/drag-state change. Canvas is redrawn from scratch each time rather than
  // incrementally patched — simplest correct approach, and cheap enough at this data size/update
  // frequency (an admin tool, not a real-time animation).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = color
    const samplesPerSecond = 1000 / bucketMs
    const startBucket = Math.max(0, Math.floor(viewStartSeconds * samplesPerSecond))
    const endBucket = Math.min(peaks.length, Math.ceil((viewStartSeconds + width / pixelsPerSecond) * samplesPerSecond))
    for (let i = startBucket; i < endBucket; i++) {
      const x = (i / samplesPerSecond - viewStartSeconds) * pixelsPerSecond
      const barHeight = Math.max(1, peaks[i] * height)
      ctx.fillRect(x, (height - barHeight) / 2, Math.max(1, pixelsPerSecond / samplesPerSecond - 1), barHeight)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    for (const range of markedRanges) {
      const { x1, x2 } = rangeToPixels(range)
      ctx.fillRect(x1, 0, x2 - x1, height)
    }

    if (pendingSelection) {
      const { x1, x2 } = rangeToPixels(pendingSelection)
      ctx.fillStyle = 'rgba(45,108,223,0.35)'
      ctx.fillRect(x1, 0, x2 - x1, height)
    }

    if (dragStartSeconds !== null && dragCurrentSeconds !== null) {
      const lo = Math.min(dragStartSeconds, dragCurrentSeconds)
      const hi = Math.max(dragStartSeconds, dragCurrentSeconds)
      const { x1, x2 } = rangeToPixels({ start: lo, end: hi })
      ctx.fillStyle = 'rgba(45,108,223,0.25)'
      ctx.fillRect(x1, 0, x2 - x1, height)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rangeToPixels/secondsAtClientX close
    // over props already listed below; including them would just re-add the same values.
  }, [peaks, bucketMs, width, height, pixelsPerSecond, viewStartSeconds, markedRanges, pendingSelection, dragStartSeconds, dragCurrentSeconds, color])

  useEffect(() => {
    if (dragStartSeconds === null) return

    function handleMove(event: MouseEvent) {
      setDragCurrentSeconds(secondsAtClientX(event.clientX))
    }
    function handleUp() {
      if (
        dragStartSeconds !== null &&
        dragCurrentSeconds !== null &&
        Math.abs(dragCurrentSeconds - dragStartSeconds) > 0.02
      ) {
        onSelectionDrafted(Math.min(dragStartSeconds, dragCurrentSeconds), Math.max(dragStartSeconds, dragCurrentSeconds))
      }
      setDragStartSeconds(null)
      setDragCurrentSeconds(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- secondsAtClientX closes over
    // viewStartSeconds/pixelsPerSecond, both already tracked via the effect re-running whenever
    // dragCurrentSeconds/dragStartSeconds change during the gesture.
  }, [dragStartSeconds, dragCurrentSeconds, onSelectionDrafted])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={(event) => {
        const seconds = secondsAtClientX(event.clientX)
        setDragStartSeconds(seconds)
        setDragCurrentSeconds(seconds)
      }}
      onWheel={(event) => {
        event.preventDefault()
        const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY
        onViewStartChange(Math.max(0, viewStartSeconds + delta / pixelsPerSecond))
      }}
    />
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/dub-sync/admin/waveform-track.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the type checker and linter**

Run: `npx tsc --noEmit && npx eslint src/app/dub-sync/admin/waveform-track.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dub-sync/admin/waveform-track.tsx src/app/dub-sync/admin/waveform-track.test.tsx
git commit -m "feat: add the WaveformTrack canvas widget"
```

---

## Task 7: `WaveformMarking` component

**Files:**
- Create: `src/app/dub-sync/admin/waveform-marking.tsx`
- Test: `src/app/dub-sync/admin/waveform-marking.test.tsx`

**Interfaces:**
- Consumes: `WaveformTrack`, `type WaveformRange` from `./waveform-track` (Task 6); `englishTimeFor`, `type EpisodeAnchors`, `type ResyncCheckpoint` from `@/lib/dub-sync/normalize`; `type DubSegment` from `@/lib/db/dub-sync`.
- Produces: `<WaveformMarking episodeId cantoPeaks englishPeaks anchors checkpoints segments onSegmentCreated />` — used by Task 8's `admin.tsx`.

Renders two `WaveformTrack`s and owns all the coordination: shared zoom, each track's own pan position, the English-follows-Cantonese sync (with manual-override persistence), the two independent pending selections, and the combined POST once both are confirmed.

- [ ] **Step 1: Write the failing tests**

Create `src/app/dub-sync/admin/waveform-marking.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./waveform-track', () => ({
  WaveformTrack: (props: {
    color: string
    viewStartSeconds: number
    onViewStartChange: (v: number) => void
    onSelectionDrafted: (start: number, end: number) => void
  }) => (
    <div>
      <button onClick={() => props.onSelectionDrafted(10, 12)}>{`draft-${props.color}`}</button>
      <button onClick={() => props.onViewStartChange(props.viewStartSeconds + 5)}>{`pan-${props.color}`}</button>
      <div data-testid={`viewstart-${props.color}`}>{props.viewStartSeconds}</div>
    </div>
  ),
}))

import { WaveformMarking } from './waveform-marking'

const anchors = { cantoContentStart: 10, cantoContentEnd: 110, englishContentStart: 20, englishContentEnd: 220 }
const CANTO_COLOR = '#4ade80'
const ENGLISH_COLOR = '#60a5fa'

function renderMarking(overrides: Partial<Parameters<typeof WaveformMarking>[0]> = {}) {
  return render(
    <WaveformMarking
      episodeId="ep-1"
      cantoPeaks={[]}
      englishPeaks={[]}
      anchors={anchors}
      checkpoints={[]}
      segments={[]}
      onSegmentCreated={vi.fn()}
      {...overrides}
    />
  )
}

describe('WaveformMarking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('does not post when only the Cantonese side is drafted', () => {
    renderMarking()
    fireEvent.click(screen.getByRole('button', { name: `draft-${CANTO_COLOR}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm segment' }))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the combined segment once both sides are drafted, and clears both', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-1',
            position: 0,
            label: null,
            cantoStart: 10,
            cantoEnd: 12,
            englishStart: 10,
            englishEnd: 12,
          },
        }),
    } as Response)
    const onSegmentCreated = vi.fn()

    renderMarking({ onSegmentCreated })
    fireEvent.click(screen.getByRole('button', { name: `draft-${CANTO_COLOR}` }))
    fireEvent.click(screen.getByRole('button', { name: `draft-${ENGLISH_COLOR}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm segment' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 10, cantoEnd: 12, englishStart: 10, englishEnd: 12 }),
        })
      )
    )
    await waitFor(() => expect(onSegmentCreated).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Cancel Cantonese line' })).not.toBeInTheDocument()
  })

  it('Cancel clears a pending side without posting', () => {
    renderMarking()
    fireEvent.click(screen.getByRole('button', { name: `draft-${CANTO_COLOR}` }))
    expect(screen.getByRole('button', { name: 'Cancel Cantonese line' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Cantonese line' }))

    expect(screen.queryByRole('button', { name: 'Cancel Cantonese line' })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('syncs the English view to englishTimeFor(cantoViewCenter) when the Cantonese view pans', () => {
    renderMarking()
    fireEvent.click(screen.getByRole('button', { name: `pan-${CANTO_COLOR}` }))
    // cantoViewStart becomes 5; center = 5 + (800/60)/2 = 11.6667
    // englishTimeFor(11.6667, anchors) = 20 + ((11.6667-10)/100)*200 = 23.3333
    // englishViewStart = 23.3333 - 6.6667 = 16.6667
    expect(screen.getByTestId(`viewstart-${ENGLISH_COLOR}`)).toHaveTextContent(/^16\.6/)
  })

  it('keeps a manual English pan until the Cantonese view changes again', () => {
    renderMarking()
    const before = Number(screen.getByTestId(`viewstart-${ENGLISH_COLOR}`).textContent)

    fireEvent.click(screen.getByRole('button', { name: `pan-${ENGLISH_COLOR}` }))

    const after = Number(screen.getByTestId(`viewstart-${ENGLISH_COLOR}`).textContent)
    expect(after).toBeCloseTo(before + 5, 5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/dub-sync/admin/waveform-marking.test.tsx`
Expected: FAIL — `./waveform-marking` doesn't exist yet.

- [ ] **Step 3: Implement `waveform-marking.tsx`**

Create `src/app/dub-sync/admin/waveform-marking.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { WaveformTrack, type WaveformRange } from './waveform-track'
import { englishTimeFor, type EpisodeAnchors, type ResyncCheckpoint } from '@/lib/dub-sync/normalize'
import type { DubSegment } from '@/lib/db/dub-sync'

const TRACK_WIDTH = 800
const TRACK_HEIGHT = 90
const BUCKET_MS = 50
const DEFAULT_PIXELS_PER_SECOND = 60
const MIN_PIXELS_PER_SECOND = 10
const MAX_PIXELS_PER_SECOND = 400
const CANTO_COLOR = '#4ade80'
const ENGLISH_COLOR = '#60a5fa'

export interface WaveformMarkingProps {
  episodeId: string
  cantoPeaks: number[]
  englishPeaks: number[]
  anchors: EpisodeAnchors
  checkpoints: ResyncCheckpoint[]
  segments: DubSegment[]
  onSegmentCreated: (segment: DubSegment) => void
}

export function WaveformMarking({
  episodeId,
  cantoPeaks,
  englishPeaks,
  anchors,
  checkpoints,
  segments,
  onSegmentCreated,
}: WaveformMarkingProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND)
  const [cantoViewStart, setCantoViewStart] = useState(0)
  const [englishViewStart, setEnglishViewStart] = useState(0)
  const [cantoPending, setCantoPending] = useState<WaveformRange | null>(null)
  const [englishPending, setEnglishPending] = useState<WaveformRange | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // Re-centers the English view on englishTimeFor(cantoViewCenter) whenever the Cantonese view
  // moves — a navigation aid only, never a saved value. Deliberately excludes englishViewStart
  // from its own dependencies, so a manual scroll on the English track (which also calls
  // setEnglishViewStart, via WaveformTrack's onViewStartChange) isn't immediately overwritten —
  // it only re-syncs the next time the Cantonese view itself changes.
  useEffect(() => {
    const cantoViewCenter = cantoViewStart + TRACK_WIDTH / pixelsPerSecond / 2
    try {
      const englishCenter = englishTimeFor(cantoViewCenter, anchors, checkpoints)
      setEnglishViewStart(Math.max(0, englishCenter - TRACK_WIDTH / pixelsPerSecond / 2))
    } catch {
      // Anchors momentarily invalid (e.g. mid-edit) — leave the English view where it is, same
      // defensive handling as computeResyncTarget.
    }
  }, [cantoViewStart, pixelsPerSecond, anchors, checkpoints])

  const cantoMarkedRanges: WaveformRange[] = segments.map((s) => ({ start: s.cantoStart, end: s.cantoEnd }))
  const englishMarkedRanges: WaveformRange[] = segments.map((s) => ({ start: s.englishStart, end: s.englishEnd }))

  async function confirmSegment() {
    if (!cantoPending || !englishPending) return
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/segments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cantoStart: cantoPending.start,
        cantoEnd: cantoPending.end,
        englishStart: englishPending.start,
        englishEnd: englishPending.end,
      }),
    })
    if (!response.ok) {
      setConfirmError('Failed to save segment')
      return
    }
    const { segment } = await response.json()
    onSegmentCreated(segment)
    setCantoPending(null)
    setEnglishPending(null)
    setConfirmError(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <button
          onClick={() => setPixelsPerSecond((p) => Math.max(MIN_PIXELS_PER_SECOND, p / 1.5))}
          className="border p-1 rounded"
          title="Zoom out"
        >
          -
        </button>
        <button
          onClick={() => setPixelsPerSecond((p) => Math.min(MAX_PIXELS_PER_SECOND, p * 1.5))}
          className="border p-1 rounded"
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="text-xs text-gray-500">Cantonese</div>
      <WaveformTrack
        peaks={cantoPeaks}
        bucketMs={BUCKET_MS}
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
        pixelsPerSecond={pixelsPerSecond}
        viewStartSeconds={cantoViewStart}
        onViewStartChange={setCantoViewStart}
        markedRanges={cantoMarkedRanges}
        pendingSelection={cantoPending}
        onSelectionDrafted={(start, end) => setCantoPending({ start, end })}
        color={CANTO_COLOR}
      />
      {cantoPending && (
        <div className="flex gap-2">
          <button onClick={() => setCantoPending(null)} className="border p-1 rounded" title="Discard this selection">
            Cancel Cantonese line
          </button>
          <span className="text-xs text-gray-500 self-center">
            {cantoPending.start.toFixed(2)}s – {cantoPending.end.toFixed(2)}s
          </span>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-2">English</div>
      <WaveformTrack
        peaks={englishPeaks}
        bucketMs={BUCKET_MS}
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
        pixelsPerSecond={pixelsPerSecond}
        viewStartSeconds={englishViewStart}
        onViewStartChange={setEnglishViewStart}
        markedRanges={englishMarkedRanges}
        pendingSelection={englishPending}
        onSelectionDrafted={(start, end) => setEnglishPending({ start, end })}
        color={ENGLISH_COLOR}
      />
      {englishPending && (
        <div className="flex gap-2">
          <button onClick={() => setEnglishPending(null)} className="border p-1 rounded" title="Discard this selection">
            Cancel English line
          </button>
          <span className="text-xs text-gray-500 self-center">
            {englishPending.start.toFixed(2)}s – {englishPending.end.toFixed(2)}s
          </span>
        </div>
      )}

      <button
        onClick={confirmSegment}
        disabled={!cantoPending || !englishPending}
        className="border p-2 rounded self-start"
        title="Save both marked lines as one segment"
      >
        Confirm segment
      </button>
      {confirmError && (
        <p role="alert" className="text-red-600">
          {confirmError}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/dub-sync/admin/waveform-marking.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the type checker and linter**

Run: `npx tsc --noEmit && npx eslint src/app/dub-sync/admin/waveform-marking.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dub-sync/admin/waveform-marking.tsx src/app/dub-sync/admin/waveform-marking.test.tsx
git commit -m "feat: add the WaveformMarking two-track coordinator"
```

---

## Task 8: `admin.tsx` — mode toggle, Generate waveforms, wiring

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Test: `src/app/dub-sync/admin/admin.test.tsx`

**Interfaces:**
- Consumes: `WaveformMarking` from `./waveform-marking` (Task 7); `DubWaveform` from `@/lib/db/dub-sync` (Task 3); `waveformsByEpisode` prop from `page.tsx` (Task 5).
- Produces: `Admin` now accepts an optional `waveformsByEpisode` prop (defaults to `{}`, so every pre-existing test call site that doesn't pass it keeps working unmodified — same pattern as `checkpointsByEpisode` before it).

- [ ] **Step 1: Write the new failing tests**

`admin.test.tsx` mocks `YoutubePlayer` at the top of the file already. Add a matching mock for `WaveformMarking` right after it, so these tests can assert on what props it receives without needing canvas mocking cascaded through this already-large file:

```tsx
vi.mock('./waveform-marking', () => ({
  WaveformMarking: (props: { cantoPeaks: number[]; englishPeaks: number[] }) => (
    <div data-testid="waveform-marking">
      <span data-testid="canto-peaks">{JSON.stringify(props.cantoPeaks)}</span>
      <span data-testid="english-peaks">{JSON.stringify(props.englishPeaks)}</span>
    </div>
  ),
}))
```

Add this new describe block to `src/app/dub-sync/admin/admin.test.tsx` (after the existing `describe('Admin resync checkpoints', ...)` block):

```tsx
describe('Admin waveform marking', () => {
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

  it('defaults to spacebar marking, and toggles to the waveform panel', () => {
    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)

    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
    expect(screen.queryByTestId('waveform-marking')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))

    expect(screen.queryByRole('button', { name: 'Play synced' })).not.toBeInTheDocument()
    expect(screen.getByTestId('waveform-marking')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Spacebar marking' }))

    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
    expect(screen.queryByTestId('waveform-marking')).not.toBeInTheDocument()
  })

  it('generates waveforms and makes the peaks available to the waveform panel', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          waveforms: [
            { id: 'wf-1', episodeId: 'ep-a', language: 'canto', peaks: [0.1, 0.2] },
            { id: 'wf-2', episodeId: 'ep-a', language: 'english', peaks: [0.3, 0.4] },
          ],
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate waveforms' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/waveforms',
        expect.objectContaining({ method: 'POST' })
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Waveform marking' }))

    await waitFor(() => expect(screen.getByTestId('canto-peaks')).toHaveTextContent('[0.1,0.2]'))
    expect(screen.getByTestId('english-peaks')).toHaveTextContent('[0.3,0.4]')
  })

  it('shows an error message when generating waveforms fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Cantonese audio (canto-a) failed: yt-dlp exited with code 1' }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate waveforms' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Cantonese audio (canto-a) failed: yt-dlp exited with code 1')
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL — no "Waveform marking"/"Generate waveforms" buttons, no `waveformsByEpisode` prop yet.

- [ ] **Step 3: Update `admin.tsx`**

1. Update imports at the top of the file:

```ts
import type { DubEpisode, DubSegment, DubResyncCheckpoint, DubWaveform } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors, type ResyncCheckpoint } from '@/lib/dub-sync/normalize'
import { computeResyncTarget } from '@/lib/dub-sync/synced-playback'
import { SegmentPlaybackController } from '@/lib/dub-sync/player-controller'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'
import { CheckpointTable } from './checkpoint-table'
import { WaveformMarking } from './waveform-marking'
import { AnchorFields } from './anchor-fields'
```

2. Update `AdminProps` and the component's destructured props:

```ts
interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
  checkpointsByEpisode?: Record<string, DubResyncCheckpoint[]>
  waveformsByEpisode?: Record<string, DubWaveform[]>
}
```

```ts
export function Admin({
  episodes: initialEpisodes,
  segmentsByEpisode: initialSegments,
  checkpointsByEpisode: initialCheckpoints = {},
  waveformsByEpisode: initialWaveforms = {},
}: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [checkpointsByEpisode, setCheckpointsByEpisode] = useState(initialCheckpoints)
  const [waveformsByEpisode, setWaveformsByEpisode] = useState(initialWaveforms)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodes[0]?.id ?? null)
```

3. Add mode state, the append-segment helper, and the generate-waveforms handler. Insert right after the existing `updateEpisodeInPlace` function:

```ts
  const [markingMode, setMarkingMode] = useState<'spacebar' | 'waveform'>('spacebar')

  function appendSegment(segment: DubSegment) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: [...(current[selectedEpisodeId] ?? []), segment],
    }))
  }

  const [generatingWaveforms, setGeneratingWaveforms] = useState(false)
  const [waveformsError, setWaveformsError] = useState<string | null>(null)

  async function runGenerateWaveforms() {
    if (!episode) return
    setGeneratingWaveforms(true)
    setWaveformsError(null)
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/waveforms`, { method: 'POST' })
    setGeneratingWaveforms(false)
    const body = await response.json()
    if (!response.ok) {
      setWaveformsError(body.error ?? 'Failed to generate waveforms')
      return
    }
    setWaveformsByEpisode((current) => ({ ...current, [episode.id]: body.waveforms }))
  }
```

(`episode` is defined a few lines below `selectedEpisodeId` in the existing file — this compiles fine since function bodies aren't evaluated until called, only declared here.)

4. In the JSX, add the mode toggle + "Generate waveforms" button right after the existing "Generate from captions" block:

```tsx
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMarkingMode('spacebar')}
                className={`border p-2 rounded ${markingMode === 'spacebar' ? 'bg-gray-800 text-white' : ''}`}
                title="Mark segments by holding SPACE during synced playback"
              >
                Spacebar marking
              </button>
              <button
                onClick={() => setMarkingMode('waveform')}
                className={`border p-2 rounded ${markingMode === 'waveform' ? 'bg-gray-800 text-white' : ''}`}
                title="Mark segments by dragging over each dub's audio waveform"
              >
                Waveform marking
              </button>
              <button
                onClick={runGenerateWaveforms}
                disabled={generatingWaveforms}
                className="border p-2 rounded"
                title="Download both videos' audio and compute waveform previews for waveform marking"
              >
                {generatingWaveforms ? 'Generating…' : 'Generate waveforms'}
              </button>
            </div>

            {waveformsError && (
              <p role="alert" className="text-red-600 mb-4">
                {waveformsError}
              </p>
            )}
```

5. Wrap the *existing* "Play synced"/"Go to content start"/"Resync checkpoint" button row, the "Hold SPACE..." instruction line, and the `adjustingCheckpoint` panel in a single `{markingMode === 'spacebar' && (<>...</>)}` — everything between them stays byte-for-byte the same, just newly wrapped:

```tsx
            {markingMode === 'spacebar' && (
              <>
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

                {syncing && !adjustingCheckpoint && (
                  <p className="text-gray-500 mb-4">Hold SPACE while a character is speaking, release when they stop.</p>
                )}

                {adjustingCheckpoint && (
                  <div className="border p-2 rounded mb-4 flex flex-col gap-2">
                    {/* ... unchanged from the existing file ... */}
                  </div>
                )}
              </>
            )}

            {markingMode === 'waveform' && anchorsSet && (
              <WaveformMarking
                key={episode.id}
                episodeId={episode.id}
                cantoPeaks={waveformsByEpisode[episode.id]?.find((w) => w.language === 'canto')?.peaks ?? []}
                englishPeaks={waveformsByEpisode[episode.id]?.find((w) => w.language === 'english')?.peaks ?? []}
                anchors={episode as DubEpisode & EpisodeAnchors}
                checkpoints={checkpoints}
                segments={segments}
                onSegmentCreated={appendSegment}
              />
            )}
```

(The `adjustingCheckpoint` panel's inner content — the nudge/preview/confirm buttons and error message — is unchanged from the current file; only its enclosing structure moves inside the new `{markingMode === 'spacebar' && (...)}` wrapper alongside the sync-controls row and instruction line. The existing "Set anchors before marking segments." message above this section already covers the `!anchorsSet` case for waveform mode too, so no second message is needed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/dub-sync/admin/admin.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors (this also resolves the expected Task 5 type error, since `Admin` now accepts `waveformsByEpisode`).

- [ ] **Step 6: Commit**

```bash
git add src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/admin.test.tsx
git commit -m "feat: add waveform-vs-spacebar marking mode toggle to the admin page"
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

Run: `npx eslint src/lib/dub-sync/spawn-process.ts src/lib/dub-sync/fs-process.ts src/lib/dub-sync/download-audio.ts src/lib/dub-sync/download-audio.test.ts src/lib/dub-sync/waveform.ts src/lib/dub-sync/waveform.test.ts src/lib/db/dub-sync.ts src/lib/db/dub-sync.test.ts src/app/api/dub-sync/episodes/\[episodeId\]/waveforms src/app/dub-sync/admin/page.tsx src/app/dub-sync/admin/waveform-track.tsx src/app/dub-sync/admin/waveform-track.test.tsx src/app/dub-sync/admin/waveform-marking.tsx src/app/dub-sync/admin/waveform-marking.test.tsx src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/admin.test.tsx`
Expected: no errors.

- [ ] **Run the production build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Manual smoke test** (per this session's established discipline for UI-affecting changes): start the dev server, open `/dub-sync/admin`, select an episode with anchors set, click "Generate waveforms" and confirm it completes without error, click "Waveform marking", confirm both tracks render visible bars, zoom in/out, pan each track independently via scroll, drag a selection on the Cantonese track, confirm the pending region and Cancel/Confirm-disabled-until-both-sides state, drag the matching line on the English track, click "Confirm segment", and verify the new row appears in the segment table. Then switch back to "Spacebar marking" and confirm the existing flow still works unaffected. Leave the dev server running for the user to verify themselves before merging, per established session practice.

## Self-Review Notes

- **Spec coverage:** No GCP dependencies → Task 1/2 use only `yt-dlp`/`ffmpeg`, confirmed no `@google-cloud/*` imports anywhere in this plan. Independent per-track marking, never computed via `englishTimeFor` → Task 7's `confirmSegment` posts `cantoPending`/`englishPending` directly; `englishTimeFor` only appears in the view-sync effect. Two-step pending-then-confirm → Task 7. Already-marked shading → Task 6's `markedRanges` prop, wired from `segments` in Task 7. English auto-scroll, independently overridable → Task 7's sync effect + its dependency-array reasoning, tested in Task 7. Pan vs. select → Task 6 (wheel vs. drag). Canvas rendering → Task 6. Peaks precomputed server-side, on-demand button → Tasks 1/2/4/8. Session-only toggle → Task 8's `markingMode` state. Every file named in the spec's Component Changes section has a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step has literal code, not a description of code. The one intentionally-elided block (the unchanged `adjustingCheckpoint` panel's inner JSX in Task 8, Step 3.5) is explicitly called out as "unchanged from the current file" with a precise description of what stays the same, rather than a vague placeholder — the executor is editing an existing file in place, not writing that block from scratch.
- **Type consistency:** `WaveformRange { start, end }` (Task 6) is used identically in Task 7's `cantoPending`/`englishPending`/`cantoMarkedRanges`/`englishMarkedRanges`. `DubWaveform { id, episodeId, language, peaks }` (Task 3) is used identically in Task 4's route, Task 5's page loader, and Task 8's `waveformsByEpisode` lookups (`.find((w) => w.language === 'canto')`). `extractWaveformPeaks`'s return type (`Promise<number[]>`, Task 2) matches `WaveformTrackProps.peaks: number[]` (Task 6) and `replaceWaveforms`'s `peaks: number[]` input (Task 3) with no conversion needed anywhere in between. `WaveformMarkingProps.onSegmentCreated: (segment: DubSegment) => void` (Task 7) matches Task 8's `appendSegment` function signature exactly.
