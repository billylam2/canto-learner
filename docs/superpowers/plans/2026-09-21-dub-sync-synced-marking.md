# Dub Sync Synced Marking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the diarization-based "Auto-mark from speech" pipeline with a synced dual-video playback flow where marking a segment is a single button press, using persisted Cantonese word timestamps to infer segment starts from real speech onsets.

**Architecture:** A one-time-per-episode Cantonese transcription (no diarization — just word timestamps) is persisted to a new table. The admin page gains a "Play synced" toggle that keeps the English player following the Cantonese player's position via periodic drift-corrected re-seeking, and a "Mark segment end" button that reads the current Cantonese time as the segment end and looks up the nearest persisted word after the previous segment's end as the segment start. All of the diarization-pairing code (which relied on speaker turns that turned out to be unusable) is deleted.

**Tech Stack:** Next.js App Router, Supabase (Postgres), Vitest + Testing Library, existing `@google-cloud/speech`/`@google-cloud/storage` transcription plumbing.

**Spec:** `docs/superpowers/specs/2026-09-21-dub-sync-synced-marking-design.md`

## Global Constraints

- TDD every step: write the failing test, confirm it fails, implement, confirm it passes, run the full suite + lint, commit.
- Follow `src/lib/db/dub-sync.ts`'s existing snake_case-row / camelCase-domain-type convention for any new DB code.
- Follow this codebase's established `vi.mock` conventions: named function expressions (not arrow functions) for any class mock constructed with `new`; mock the `./spawn-process` / `./fs-process` wrapper modules, never Node builtins directly.
- No new environment variables are needed — this reuses the existing `GOOGLE_CLOUD_PROJECT` and `DUB_SYNC_GCS_BUCKET`.
- Applying the new migration is a manual step for the operator (same pattern as the existing Supabase table setup) — no migration-runner script exists in this repo.

---

### Task 1: Persist Cantonese word timestamps (DB layer)

**Files:**
- Create: `supabase/migrations/0006_create_dub_canto_words.sql`
- Modify: `src/lib/db/dub-sync.ts`
- Test: `src/lib/db/dub-sync.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `CantoWord { id: string; episodeId: string; text: string; startTime: number; endTime: number }`, `CreateCantoWordInput { text: string; startTime: number; endTime: number }`, `replaceCantoWords(supabase: SupabaseClient, episodeId: string, words: CreateCantoWordInput[]): Promise<CantoWord[]>`, `listCantoWords(supabase: SupabaseClient, episodeId: string): Promise<CantoWord[]>` — all consumed by Task 2's new route and Task 5's admin page.

- [ ] **Step 1: Write the migration file**

```sql
create table dub_canto_words (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references dub_episodes(id) on delete cascade,
  text text not null,
  start_time real not null,
  end_time real not null,
  created_at timestamptz not null default now()
);

alter table dub_canto_words enable row level security;
```

Save to `supabase/migrations/0006_create_dub_canto_words.sql`.

- [ ] **Step 2: Write the failing tests for `replaceCantoWords` and `listCantoWords`**

Open `src/lib/db/dub-sync.test.ts`. Add `replaceCantoWords` and `listCantoWords` to the existing import block at the top (alongside `createSegment`, `createSegmentsBulk`, etc.). Then append at the end of the file:

```ts
function makeReplaceCantoWordsMock(
  deleteResult: { error: unknown },
  insertResult: { data: unknown; error: unknown }
) {
  const deleteEq = vi.fn().mockResolvedValue(deleteResult)
  const del = vi.fn().mockReturnValue({ eq: deleteEq })
  const insertSelect = vi.fn().mockResolvedValue(insertResult)
  const insert = vi.fn().mockReturnValue({ select: insertSelect })
  const from = vi.fn().mockReturnValue({ delete: del, insert })
  return { from } as unknown as SupabaseClient
}

describe('replaceCantoWords', () => {
  it('deletes existing words and inserts the new set, mapped to camelCase', async () => {
    const supabase = makeReplaceCantoWordsMock(
      { error: null },
      {
        data: [
          { id: 'w-1', episode_id: 'ep-1', text: '你好', start_time: 1.2, end_time: 1.6 },
          { id: 'w-2', episode_id: 'ep-1', text: '喬治', start_time: 2.0, end_time: 2.4 },
        ],
        error: null,
      }
    )
    const result = await replaceCantoWords(supabase, 'ep-1', [
      { text: '你好', startTime: 1.2, endTime: 1.6 },
      { text: '喬治', startTime: 2.0, endTime: 2.4 },
    ])
    expect(result).toEqual([
      { id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1.2, endTime: 1.6 },
      { id: 'w-2', episodeId: 'ep-1', text: '喬治', startTime: 2.0, endTime: 2.4 },
    ])
  })

  it('returns an empty array without inserting when given no words', async () => {
    const supabase = makeReplaceCantoWordsMock({ error: null }, { data: [], error: null })
    const result = await replaceCantoWords(supabase, 'ep-1', [])
    expect(result).toEqual([])
  })

  it('throws when the delete fails', async () => {
    const supabase = makeReplaceCantoWordsMock({ error: { message: 'boom' } }, { data: [], error: null })
    await expect(
      replaceCantoWords(supabase, 'ep-1', [{ text: 'hi', startTime: 0, endTime: 1 }])
    ).rejects.toThrow('Failed to clear existing canto words for episode ep-1: boom')
  })

  it('throws when the insert fails', async () => {
    const supabase = makeReplaceCantoWordsMock({ error: null }, { data: null, error: { message: 'boom' } })
    await expect(
      replaceCantoWords(supabase, 'ep-1', [{ text: 'hi', startTime: 0, endTime: 1 }])
    ).rejects.toThrow('Failed to save canto words for episode ep-1: boom')
  })
})

function makeListCantoWordsMock(overrides: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(overrides)
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as SupabaseClient
}

describe('listCantoWords', () => {
  it('returns words ordered by start time', async () => {
    const supabase = makeListCantoWordsMock({
      data: [{ id: 'w-1', episode_id: 'ep-1', text: '你好', start_time: 1.2, end_time: 1.6 }],
      error: null,
    })
    const result = await listCantoWords(supabase, 'ep-1')
    expect(result).toEqual([{ id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1.2, endTime: 1.6 }])
  })

  it('throws when the query fails', async () => {
    const supabase = makeListCantoWordsMock({ data: null, error: { message: 'boom' } })
    await expect(listCantoWords(supabase, 'ep-1')).rejects.toThrow(
      'Failed to list canto words for episode ep-1: boom'
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/lib/db/dub-sync.test.ts`
Expected: FAIL with `replaceCantoWords is not defined` / `listCantoWords is not defined` (or a TypeScript import error).

- [ ] **Step 4: Implement `replaceCantoWords` and `listCantoWords`**

Append to `src/lib/db/dub-sync.ts`, after the existing `deleteSegment` function at the end of the file:

```ts
export interface CantoWord {
  id: string
  episodeId: string
  text: string
  startTime: number
  endTime: number
}

interface CantoWordRow {
  id: string
  episode_id: string
  text: string
  start_time: number
  end_time: number
}

function toCantoWord(row: CantoWordRow): CantoWord {
  return {
    id: row.id,
    episodeId: row.episode_id,
    text: row.text,
    startTime: row.start_time,
    endTime: row.end_time,
  }
}

export interface CreateCantoWordInput {
  text: string
  startTime: number
  endTime: number
}

export async function replaceCantoWords(
  supabase: SupabaseClient,
  episodeId: string,
  words: CreateCantoWordInput[]
): Promise<CantoWord[]> {
  const { error: deleteError } = await supabase.from('dub_canto_words').delete().eq('episode_id', episodeId)
  if (deleteError) {
    throw new Error(`Failed to clear existing canto words for episode ${episodeId}: ${deleteError.message}`)
  }

  if (words.length === 0) return []

  const rows = words.map((word) => ({
    episode_id: episodeId,
    text: word.text,
    start_time: word.startTime,
    end_time: word.endTime,
  }))

  const { data, error } = await supabase.from('dub_canto_words').insert(rows).select('*')
  if (error) {
    throw new Error(`Failed to save canto words for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as CantoWordRow[]).map(toCantoWord)
}

export async function listCantoWords(supabase: SupabaseClient, episodeId: string): Promise<CantoWord[]> {
  const { data, error } = await supabase
    .from('dub_canto_words')
    .select('*')
    .eq('episode_id', episodeId)
    .order('start_time', { ascending: true })

  if (error) {
    throw new Error(`Failed to list canto words for episode ${episodeId}: ${error.message}`)
  }
  return ((data ?? []) as CantoWordRow[]).map(toCantoWord)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/lib/db/dub-sync.test.ts`
Expected: PASS, all tests including the 6 new ones.

- [ ] **Step 6: Document the new migration in the README**

In `README.md`, in the "Dub Sync admin tool" section, add a bullet after the existing `DUB_SYNC_GCS_BUCKET` bullet:

```markdown
- Apply `supabase/migrations/0006_create_dub_canto_words.sql` — adds the table that stores each episode's transcribed Cantonese word timestamps (used by the "Transcribe Cantonese" button to infer segment start times).
```

- [ ] **Step 7: Run the full suite and lint, then commit**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors.

```bash
git add supabase/migrations/0006_create_dub_canto_words.sql src/lib/db/dub-sync.ts src/lib/db/dub-sync.test.ts README.md
git commit -m "feat: persist per-episode Cantonese word timestamps"
```

---

### Task 2: Simplify transcription and replace auto-mark with transcribe-canto

**Files:**
- Modify: `src/lib/dub-sync/transcribe.ts`
- Modify: `src/lib/dub-sync/transcribe.test.ts`
- Delete: `src/app/api/dub-sync/episodes/[episodeId]/auto-mark/route.ts`
- Delete: `src/app/api/dub-sync/episodes/[episodeId]/auto-mark/route.test.ts`
- Create: `src/app/api/dub-sync/episodes/[episodeId]/transcribe-canto/route.ts`
- Create: `src/app/api/dub-sync/episodes/[episodeId]/transcribe-canto/route.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `replaceCantoWords`, `CreateCantoWordInput` from Task 1.
- Produces: `TranscribedWord { text: string; startTime: number; endTime: number }` and `transcribeWords(audioFilePath: string, languageCode: string): Promise<TranscribedWord[]>` in `transcribe.ts` (renamed from `transcribeWithDiarization`, diarization config dropped) — consumed by the new route below. `downloadAudio`, `deleteAudioFile`, `uploadToGcs`, `deleteFromGcs` are unchanged.

This task must land as one atomic change: `transcribeWithDiarization` is renamed and its only caller (the auto-mark route) is deleted in the same task, so the codebase never sits in a state where a route imports a function that no longer exists.

This task is bigger than most because the rename and the route swap are inseparable, but keep committing at the natural sub-boundaries below rather than saving everything for one giant commit.

- [ ] **Step 1: Rename `transcribeWithDiarization` to `transcribeWords`, drop diarization, in `transcribe.test.ts` first**

Open `src/lib/dub-sync/transcribe.test.ts`. Every occurrence of `transcribeWithDiarization` becomes `transcribeWords` (the import on the `import { transcribeWithDiarization, uploadToGcs, deleteFromGcs } from './transcribe'` line, and all four call sites in the `describe('transcribeWithDiarization', ...)` block — rename that `describe` to `'transcribeWords'` too). In the first test (`'extracts words with timestamps and speaker tags from the final diarized result'`), remove `speakerTag` from both the fake word fixtures and the expected output, and rename the test to `'extracts words with timestamps from the transcription result'`:

```ts
describe('transcribeWords', () => {
  const originalBucketEnv = process.env.DUB_SYNC_GCS_BUCKET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DUB_SYNC_GCS_BUCKET = 'my-bucket'
  })

  afterEach(() => {
    process.env.DUB_SYNC_GCS_BUCKET = originalBucketEnv
  })

  it('extracts words with timestamps from the transcription result', async () => {
    mockUpload.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })

    const fakeOperation = {
      promise: vi.fn().mockResolvedValue([
        {
          results: [
            { alternatives: [{ words: [] }] }, // earlier, non-final results are ignored
            {
              alternatives: [
                {
                  words: [
                    { word: '你好', startTime: { seconds: '0', nanos: 0 }, endTime: { seconds: '0', nanos: 500000000 } },
                    { word: '喬治', startTime: { seconds: '1', nanos: 0 }, endTime: { seconds: '1', nanos: 500000000 } },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    }
    const longRunningRecognize = vi.fn().mockResolvedValue([fakeOperation])
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize } as never
    })

    const words = await transcribeWords('/tmp/audio.mp3', 'yue-Hant-HK')

    expect(words).toEqual([
      { text: '你好', startTime: 0, endTime: 0.5 },
      { text: '喬治', startTime: 1, endTime: 1.5 },
    ])
    expect(mockUpload).toHaveBeenCalledWith('/tmp/audio.mp3', expect.objectContaining({ destination: expect.any(String) }))
    expect(longRunningRecognize).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: { uri: expect.stringMatching(/^gs:\/\/my-bucket\/.+\.mp3$/) },
        config: expect.objectContaining({ sampleRateHertz: 16000, audioChannelCount: 1 }),
      })
    )
    expect(mockDelete).toHaveBeenCalled()
  })

  it('does not request speaker diarization', async () => {
    mockUpload.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })
    const fakeOperation = { promise: vi.fn().mockResolvedValue([{ results: [] }]) }
    const longRunningRecognize = vi.fn().mockResolvedValue([fakeOperation])
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize } as never
    })

    await transcribeWords('/tmp/audio.mp3', 'en-US')

    expect(longRunningRecognize).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.not.objectContaining({ diarizationConfig: expect.anything() }) })
    )
  })

  it('returns an empty array when there are no results', async () => {
    mockUpload.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })
    const fakeOperation = { promise: vi.fn().mockResolvedValue([{ results: [] }]) }
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize: vi.fn().mockResolvedValue([fakeOperation]) } as never
    })

    const words = await transcribeWords('/tmp/audio.mp3', 'en-US')
    expect(words).toEqual([])
  })

  it('deletes the uploaded gcs object even when recognition fails', async () => {
    mockUpload.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize: vi.fn().mockRejectedValue(new Error('recognize failed')) } as never
    })

    await expect(transcribeWords('/tmp/audio.mp3', 'en-US')).rejects.toThrow('recognize failed')
    expect(mockDelete).toHaveBeenCalled()
  })

  it('throws a clear error when DUB_SYNC_GCS_BUCKET is not set', async () => {
    delete process.env.DUB_SYNC_GCS_BUCKET

    await expect(transcribeWords('/tmp/audio.mp3', 'en-US')).rejects.toThrow('DUB_SYNC_GCS_BUCKET')
  })
})
```

Also update the import line above it: `import { transcribeWords, uploadToGcs, deleteFromGcs } from './transcribe'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/dub-sync/transcribe.test.ts`
Expected: FAIL — `transcribeWords` is not exported yet.

- [ ] **Step 3: Rename and simplify in `transcribe.ts`**

In `src/lib/dub-sync/transcribe.ts`:
1. Remove the `import type { TranscribedWord } from './group-words-by-speaker'` line and replace it with a local definition (this type no longer belongs to the speaker-grouping module, which is being deleted in Task 3):

```ts
export interface TranscribedWord {
  text: string
  startTime: number
  endTime: number
}
```

2. Rename `transcribeWithDiarization` to `transcribeWords`, remove the `diarizationConfig` block from its request config, and drop `speakerTag` from the returned word objects:

```ts
export async function transcribeWords(audioFilePath: string, languageCode: string): Promise<TranscribedWord[]> {
  const bucketName = getGcsBucketName()
  const gcsUri = await uploadToGcs(audioFilePath, bucketName)

  try {
    const client = new SpeechClient()
    const [operation] = await client.longRunningRecognize({
      audio: { uri: gcsUri },
      config: {
        encoding: 'MP3',
        // Must match downloadAudio's forced output rate — Speech-to-Text doesn't reliably read the
        // MP3 header's actual rate and silently mis-decodes (near-total word loss) if this drifts.
        sampleRateHertz: 16000,
        audioChannelCount: 1,
        languageCode,
        enableWordTimeOffsets: true,
      },
    })

    const [response] = await operation.promise()
    const results = response.results ?? []
    const lastResult = results[results.length - 1]
    const wordInfos = lastResult?.alternatives?.[0]?.words ?? []

    return wordInfos.map((wordInfo) => ({
      text: wordInfo.word ?? '',
      startTime: secondsFromDuration(wordInfo.startTime),
      endTime: secondsFromDuration(wordInfo.endTime),
    }))
  } finally {
    await deleteFromGcs(gcsUri)
  }
}
```

(`downloadAudio`, `deleteAudioFile`, `getGcsBucketName`, `uploadToGcs`, `deleteFromGcs`, and `secondsFromDuration` are all unchanged — only the function above and the `TranscribedWord` type/import move.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/dub-sync/transcribe.test.ts`
Expected: PASS, all 12 tests (the rename didn't change the total count — one test was renamed, one new one was added for the dropped diarization config, and the diarization-specific assertions were removed from the first test, net the same).

- [ ] **Step 5: Commit the transcribe.ts simplification**

```bash
git add src/lib/dub-sync/transcribe.ts src/lib/dub-sync/transcribe.test.ts
git commit -m "refactor: rename transcribeWithDiarization to transcribeWords, drop diarization"
```

- [ ] **Step 6: Write the failing test for the new transcribe-canto route**

Create `src/app/api/dub-sync/episodes/[episodeId]/transcribe-canto/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  replaceCantoWords: vi.fn(),
}))

vi.mock('@/lib/dub-sync/transcribe', () => ({
  downloadAudio: vi.fn(),
  transcribeWords: vi.fn(),
  deleteAudioFile: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, replaceCantoWords } from '@/lib/db/dub-sync'
import { downloadAudio, transcribeWords, deleteAudioFile } from '@/lib/dub-sync/transcribe'

const episode = {
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

async function makeRequest(): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/transcribe-canto', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/transcribe-canto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('downloads, transcribes, persists, and cleans up the audio file', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockResolvedValue('/tmp/canto-123.mp3')
    vi.mocked(transcribeWords).mockResolvedValue([{ text: '你好', startTime: 1, endTime: 1.5 }])
    vi.mocked(replaceCantoWords).mockResolvedValue([
      { id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1, endTime: 1.5 },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.words).toEqual([{ id: 'w-1', episodeId: 'ep-1', text: '你好', startTime: 1, endTime: 1.5 }])
    expect(downloadAudio).toHaveBeenCalledWith('canto-123')
    expect(transcribeWords).toHaveBeenCalledWith('/tmp/canto-123.mp3', 'yue-Hant-HK')
    expect(replaceCantoWords).toHaveBeenCalledWith(expect.anything(), 'ep-1', [
      { text: '你好', startTime: 1, endTime: 1.5 },
    ])
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/transcribe-canto', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 502 and still cleans up when the download fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockRejectedValue(new Error('yt-dlp not found'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('canto-123')
    expect(body.error).toContain('yt-dlp not found')
  })

  it('returns 502 and still cleans up when transcription fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episode)
    vi.mocked(downloadAudio).mockResolvedValue('/tmp/canto-123.mp3')
    vi.mocked(transcribeWords).mockRejectedValue(new Error('Speech-to-Text quota exceeded'))

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('quota exceeded')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- src/app/api/dub-sync/episodes/\[episodeId\]/transcribe-canto/route.test.ts`
Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 8: Delete the auto-mark route and its test, create the transcribe-canto route**

Delete `src/app/api/dub-sync/episodes/[episodeId]/auto-mark/route.ts` and `src/app/api/dub-sync/episodes/[episodeId]/auto-mark/route.test.ts`.

Create `src/app/api/dub-sync/episodes/[episodeId]/transcribe-canto/route.ts`. Download and transcription each get their own try/catch (rather than one `.catch` on `downloadAudio` that rethrows) so a download failure — which leaves no file to clean up — is distinguished from a transcription failure — which does, via `deleteAudioFile`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, replaceCantoWords } from '@/lib/db/dub-sync'
import { readAdminSession } from '@/lib/auth/admin-session'
import { downloadAudio, transcribeWords, deleteAudioFile } from '@/lib/dub-sync/transcribe'

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

  let audioPath: string
  try {
    audioPath = await downloadAudio(episode.cantoneseVideoId)
  } catch (error) {
    return NextResponse.json(
      { error: `Cantonese video (${episode.cantoneseVideoId}) failed to download: ${(error as Error).message}` },
      { status: 502 }
    )
  }

  let words
  try {
    words = await transcribeWords(audioPath, 'yue-Hant-HK')
  } catch (error) {
    await deleteAudioFile(audioPath)
    return NextResponse.json(
      { error: `Cantonese video (${episode.cantoneseVideoId}) failed to transcribe: ${(error as Error).message}` },
      { status: 502 }
    )
  }
  await deleteAudioFile(audioPath)

  const saved = await replaceCantoWords(supabase, episodeId, words)
  return NextResponse.json({ words: saved }, { status: 201 })
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- src/app/api/dub-sync/episodes/\[episodeId\]/transcribe-canto/route.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 10: Update the README's yt-dlp/transcription bullet**

In `README.md`, replace the existing bullet:

```markdown
- **[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)** installed and on `PATH` wherever `npm run dev` (or however the app is served) runs — required by the "Auto-mark from speech" button, which downloads each video's audio temporarily (never kept or served) to transcribe it via Google Cloud Speech-to-Text with speaker diarization. Also requires the Speech-to-Text API enabled on the same `GOOGLE_CLOUD_PROJECT` already used for text-to-speech.
```

with:

```markdown
- **[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)** installed and on `PATH` wherever `npm run dev` (or however the app is served) runs — required by the "Transcribe Cantonese" button, which downloads the Cantonese video's audio temporarily (never kept or served) to transcribe it via Google Cloud Speech-to-Text (word timestamps only — speaker diarization was tried and dropped; Google doesn't support it for Cantonese at all, and it proved unreliable for English too). Also requires the Speech-to-Text API enabled on the same `GOOGLE_CLOUD_PROJECT` already used for text-to-speech.
```

- [ ] **Step 11: Run the full suite and lint, then commit**

Run: `npm test && npm run lint`
Expected: all tests pass (the auto-mark route's 7 tests are gone, transcribe-canto's 5 are new — net change reflects that), no lint errors.

```bash
git add src/app/api/dub-sync/episodes/\[episodeId\]/transcribe-canto src/app/api/dub-sync/episodes/\[episodeId\]/auto-mark README.md
git commit -m "feat: replace auto-mark route with transcribe-canto"
```

---

### Task 3: Remove dead diarization-pairing code

**Files:**
- Delete: `src/lib/dub-sync/pair-diarized-turns.ts`
- Delete: `src/lib/dub-sync/pair-diarized-turns.test.ts`
- Delete: `src/lib/dub-sync/group-words-by-speaker.ts`
- Delete: `src/lib/dub-sync/group-words-by-speaker.test.ts`
- Modify: `src/lib/dub-sync/candidate-segments.ts`
- Modify: `src/lib/dub-sync/candidate-segments.test.ts`
- Modify: `src/lib/dub-sync/normalize.ts`
- Modify: `src/lib/dub-sync/normalize.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is pure deletion. `cuesToCandidateSegments` and `englishTimeFor` remain exactly as they are (still used by `generate-segments` and the rest of the app respectively); only their now-unused siblings are removed.

This task is safe now specifically because Task 2 already deleted the auto-mark route, which was the only caller of everything below.

- [ ] **Step 1: Delete the two fully-dead files and their tests**

```bash
rm src/lib/dub-sync/pair-diarized-turns.ts src/lib/dub-sync/pair-diarized-turns.test.ts
rm src/lib/dub-sync/group-words-by-speaker.ts src/lib/dub-sync/group-words-by-speaker.test.ts
```

- [ ] **Step 2: Remove `englishCuesToCandidateSegments` from `candidate-segments.ts`**

In `src/lib/dub-sync/candidate-segments.ts`, remove the `englishCuesToCandidateSegments` function (everything from its preceding comment through its closing brace) and change the import line back to only what `cuesToCandidateSegments` needs:

```ts
import type { EpisodeAnchors } from './normalize'
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

export function cuesToCandidateSegments(cues: TimedCue[], anchors: EpisodeAnchors): CandidateSegment[] {
  return cues
    .filter((cue) => cue.start >= anchors.cantoContentStart && cue.end <= anchors.cantoContentEnd)
    .map((cue) => ({
      cantoStart: cue.start,
      cantoEnd: cue.end,
      englishStart: englishTimeFor(cue.start, anchors),
      englishEnd: englishTimeFor(cue.end, anchors),
    }))
}
```

That's the entire file.

- [ ] **Step 3: Remove the `englishCuesToCandidateSegments` describe block from its test file**

In `src/lib/dub-sync/candidate-segments.test.ts`, remove the `describe('englishCuesToCandidateSegments', ...)` block and change the import back to:

```ts
import { describe, it, expect } from 'vitest'
import { cuesToCandidateSegments } from './candidate-segments'
import type { EpisodeAnchors } from './normalize'
import type { CaptionCue } from './captions'
```

The `describe('cuesToCandidateSegments', ...)` block and the `anchors` constant above it are unchanged.

- [ ] **Step 4: Remove `cantoTimeFor` from `normalize.ts`**

In `src/lib/dub-sync/normalize.ts`, remove the `cantoTimeFor` function, leaving only:

```ts
export interface EpisodeAnchors {
  cantoContentStart: number
  cantoContentEnd: number
  englishContentStart: number
  englishContentEnd: number
}

export function englishTimeFor(cantoT: number, anchors: EpisodeAnchors): number {
  const { cantoContentStart, cantoContentEnd, englishContentStart, englishContentEnd } = anchors
  const cantoSpan = cantoContentEnd - cantoContentStart

  if (cantoSpan <= 0) {
    throw new Error('Invalid anchors: cantoContentEnd must be after cantoContentStart')
  }

  const ratio = (cantoT - cantoContentStart) / cantoSpan
  return englishContentStart + ratio * (englishContentEnd - englishContentStart)
}
```

- [ ] **Step 5: Remove the `cantoTimeFor` describe block from its test file**

In `src/lib/dub-sync/normalize.test.ts`, remove the `describe('cantoTimeFor', ...)` block and change the import back to:

```ts
import { describe, it, expect } from 'vitest'
import { englishTimeFor, type EpisodeAnchors } from './normalize'
```

The `describe('englishTimeFor', ...)` block and the `anchors` constant above it are unchanged.

- [ ] **Step 6: Run the full suite and lint to verify nothing else referenced the deleted code**

Run: `npm test && npm run lint`
Expected: all tests pass with no references to the deleted files/exports remaining (TypeScript will fail to compile if anything still imports them).

- [ ] **Step 7: Commit**

```bash
git add -A src/lib/dub-sync
git commit -m "refactor: remove unused diarization-pairing code"
```

---

### Task 4: Add synced-playback and next-word-start helpers

**Files:**
- Create: `src/lib/dub-sync/synced-playback.ts`
- Create: `src/lib/dub-sync/synced-playback.test.ts`
- Create: `src/lib/dub-sync/next-word-start.ts`
- Create: `src/lib/dub-sync/next-word-start.test.ts`

**Interfaces:**
- Consumes: `EpisodeAnchors`, `englishTimeFor` from `./normalize` (Task 3's trimmed-down version).
- Produces: `computeResyncTarget(cantoTime: number, englishCurrentTime: number, anchors: EpisodeAnchors, thresholdSeconds?: number): number | null` and `findNextWordStart(words: { startTime: number }[], afterTime: number, maxTime: number): number | null` — both consumed by Task 5's admin component.

Both of these are small, pure, and independently testable without touching React or timers — the admin component in Task 5 just calls them.

- [ ] **Step 1: Write the failing test for `findNextWordStart`**

Create `src/lib/dub-sync/next-word-start.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findNextWordStart } from './next-word-start'

describe('findNextWordStart', () => {
  it('returns the earliest word start at or after the given time', () => {
    const words = [{ startTime: 5 }, { startTime: 12 }, { startTime: 20 }]
    expect(findNextWordStart(words, 10, 100)).toBe(12)
  })

  it('includes a word starting exactly at the given time', () => {
    const words = [{ startTime: 10 }]
    expect(findNextWordStart(words, 10, 100)).toBe(10)
  })

  it('excludes words starting after the max time', () => {
    const words = [{ startTime: 50 }]
    expect(findNextWordStart(words, 10, 20)).toBeNull()
  })

  it('returns null when there are no words at or after the given time', () => {
    const words = [{ startTime: 1 }, { startTime: 2 }]
    expect(findNextWordStart(words, 10, 100)).toBeNull()
  })

  it('returns null for an empty word list', () => {
    expect(findNextWordStart([], 0, 100)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/dub-sync/next-word-start.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `findNextWordStart`**

Create `src/lib/dub-sync/next-word-start.ts`:

```ts
export interface TimedWord {
  startTime: number
}

export function findNextWordStart(words: TimedWord[], afterTime: number, maxTime: number): number | null {
  const candidates = words.filter((word) => word.startTime >= afterTime && word.startTime <= maxTime)
  if (candidates.length === 0) return null
  return Math.min(...candidates.map((word) => word.startTime))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/dub-sync/next-word-start.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Write the failing test for `computeResyncTarget`**

Create `src/lib/dub-sync/synced-playback.test.ts`:

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
    expect(computeResyncTarget(60, 121, anchors, 0.5)).toBe(120)
    expect(computeResyncTarget(60, 120.4, anchors, 0.5)).toBeNull()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/lib/dub-sync/synced-playback.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 7: Implement `computeResyncTarget`**

Create `src/lib/dub-sync/synced-playback.ts`:

```ts
import type { EpisodeAnchors } from './normalize'
import { englishTimeFor } from './normalize'

const DEFAULT_THRESHOLD_SECONDS = 0.75

export function computeResyncTarget(
  cantoTime: number,
  englishCurrentTime: number,
  anchors: EpisodeAnchors,
  thresholdSeconds: number = DEFAULT_THRESHOLD_SECONDS
): number | null {
  const target = englishTimeFor(cantoTime, anchors)
  return Math.abs(englishCurrentTime - target) > thresholdSeconds ? target : null
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/lib/dub-sync/synced-playback.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 9: Run the full suite and lint, then commit**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors.

```bash
git add src/lib/dub-sync/synced-playback.ts src/lib/dub-sync/synced-playback.test.ts src/lib/dub-sync/next-word-start.ts src/lib/dub-sync/next-word-start.test.ts
git commit -m "feat: add synced-playback resync and next-word-start helpers"
```

---

### Task 5: Rework the admin page for synced marking

**Files:**
- Modify: `src/app/dub-sync/admin/page.tsx`
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Modify: `src/app/dub-sync/admin/admin.test.tsx`

**Interfaces:**
- Consumes: `listCantoWords`, `CantoWord` from Task 1; the `/transcribe-canto` route from Task 2; `computeResyncTarget` from Task 4's `synced-playback.ts`; `findNextWordStart` from Task 4's `next-word-start.ts`; `englishTimeFor` from `normalize.ts` (unchanged); the existing `YoutubePlayerHandle` (`seekTo`, `playVideo`, `pauseVideo`, `getCurrentTime` — all already present, no changes needed there).
- Produces: nothing consumed elsewhere — this is the top of the admin UI's call graph.

- [ ] **Step 1: Update `page.tsx` to fetch persisted Cantonese words**

Replace the full contents of `src/app/dub-sync/admin/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes, listSegments, listCantoWords, type DubSegment, type CantoWord } from '@/lib/db/dub-sync'
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
  const cantoWordsByEpisode: Record<string, CantoWord[]> = {}
  for (const episode of episodes) {
    segmentsByEpisode[episode.id] = await listSegments(supabase, episode.id)
    cantoWordsByEpisode[episode.id] = await listCantoWords(supabase, episode.id)
  }

  return <Admin episodes={episodes} segmentsByEpisode={segmentsByEpisode} cantoWordsByEpisode={cantoWordsByEpisode} />
}
```

- [ ] **Step 2: Write the failing tests for the reworked `Admin` component**

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
    render(
      <Admin
        episodes={[episodeA, episodeB]}
        segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }}
        cantoWordsByEpisode={{ 'ep-a': [], 'ep-b': [] }}
      />
    )

    expect(screen.getByRole('heading', { name: 'Muddy Puddles' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'The Playgroup' }))

    expect(screen.getByRole('heading', { name: 'The Playgroup' })).toBeInTheDocument()
  })

  it('selects a newly created episode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeB, id: 'ep-c', title: 'New Episode' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} cantoWordsByEpisode={{ 'ep-a': [] }} />)

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

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} cantoWordsByEpisode={{ 'ep-a': [] }} />)
    refs.assign(makeHandle(() => 8), makeHandle(() => 0))

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'PATCH' }))
    )
  })
})

describe('Admin transcribe canto and generate from captions', () => {
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

  it('runs transcribe canto, shows a working state, and clears it on success', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )
    )

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transcribe Cantonese' }))

    expect(screen.getByRole('button', { name: 'Transcribing…' })).toBeDisabled()

    resolveFetch({
      ok: true,
      json: () =>
        Promise.resolve({ words: [{ id: 'w-1', episodeId: 'ep-a', text: '你好', startTime: 1, endTime: 1.5 }] }),
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Transcribe Cantonese' })).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/episodes/ep-a/transcribe-canto',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('shows an error when transcription fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'yt-dlp not found' }) })
    )

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transcribe Cantonese' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('yt-dlp not found'))
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

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
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

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
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

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause synced' }))

    expect(cantoHandle.pauseVideo).toHaveBeenCalled()
    expect(englishHandle.pauseVideo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play synced' })).toBeInTheDocument()
  })

  it('re-seeks the english player only once drift exceeds the threshold', () => {
    vi.useFakeTimers()
    const refs = captureRefs()
    let cantoTime = 60 // englishTimeFor(60, anchors) = 120
    let englishTime = 120.2 // within the 0.75s threshold
    const cantoHandle = makeHandle(() => cantoTime)
    const englishHandle = makeHandle(() => englishTime)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [] }}
      />
    )
    refs.assign(cantoHandle, englishHandle)

    fireEvent.click(screen.getByRole('button', { name: 'Play synced' }))
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).not.toHaveBeenCalled()

    englishTime = 130
    vi.advanceTimersByTime(1000)
    expect(englishHandle.seekTo).toHaveBeenCalledWith(120, true)
  })
})

describe('Admin mark segment end', () => {
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

  it('marks a segment, inferring the start from the next word after the content start', async () => {
    const refs = captureRefs()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 15,
            cantoEnd: 35,
            englishStart: 30,
            englishEnd: 70,
          },
        }),
    } as Response)

    render(
      <Admin
        episodes={[episodeWithAnchors]}
        segmentsByEpisode={{ 'ep-a': [] }}
        cantoWordsByEpisode={{ 'ep-a': [{ id: 'w-1', episodeId: 'ep-a', text: 'hi', startTime: 15, endTime: 15.5 }] }}
      />
    )
    refs.assign(makeHandle(() => 35), makeHandle(() => 60))

    fireEvent.click(screen.getByRole('button', { name: 'Mark segment end' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 15, cantoEnd: 35, englishStart: 30, englishEnd: 70 }),
        })
      )
    )
  })

  it('falls back to the previous segment end when no word is found after it', async () => {
    const refs = captureRefs()
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
            cantoEnd: 50,
            englishStart: 70,
            englishEnd: 100,
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
    refs.assign(makeHandle(() => 50), makeHandle(() => 80))

    fireEvent.click(screen.getByRole('button', { name: 'Mark segment end' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cantoStart: 35, cantoEnd: 50, englishStart: 70, englishEnd: 100 }),
        })
      )
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL — `cantoWordsByEpisode` isn't an accepted prop, `Transcribe Cantonese`/`Play synced`/`Mark segment end` buttons don't exist yet, `admin.tsx` still expects the old props shape.

- [ ] **Step 4: Rewrite `admin.tsx`**

Replace the full contents of `src/app/dub-sync/admin/admin.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { CantoWord, DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import { englishTimeFor, type EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { computeResyncTarget } from '@/lib/dub-sync/synced-playback'
import { findNextWordStart } from '@/lib/dub-sync/next-word-start'
import { NewEpisodeForm } from './new-episode-form'
import { SegmentTable } from './segment-table'

interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
  cantoWordsByEpisode: Record<string, CantoWord[]>
}

function hasAllAnchors(episode: DubEpisode): episode is DubEpisode & EpisodeAnchors {
  return (
    episode.cantoContentStart !== null &&
    episode.cantoContentEnd !== null &&
    episode.englishContentStart !== null &&
    episode.englishContentEnd !== null
  )
}

export function Admin({
  episodes: initialEpisodes,
  segmentsByEpisode: initialSegments,
  cantoWordsByEpisode: initialCantoWords,
}: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [cantoWordsByEpisode, setCantoWordsByEpisode] = useState(initialCantoWords)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodes[0]?.id ?? null)

  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)

  const episode = episodes.find((candidate) => candidate.id === selectedEpisodeId) ?? null
  const segments = selectedEpisodeId ? (segmentsByEpisode[selectedEpisodeId] ?? []) : []
  const cantoWords = selectedEpisodeId ? (cantoWordsByEpisode[selectedEpisodeId] ?? []) : []

  function handleEpisodeCreated(newEpisode: DubEpisode) {
    setEpisodes((current) => [...current, newEpisode])
    setSegmentsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
    setCantoWordsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
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
  }

  const [transcribeState, setTranscribeState] = useState<{ working: boolean; error: string | null }>({
    working: false,
    error: null,
  })

  async function runTranscribeCanto() {
    if (!episode) return
    setTranscribeState({ working: true, error: null })
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/transcribe-canto`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setTranscribeState({ working: false, error: body.error ?? 'Failed to transcribe Cantonese audio' })
      return
    }
    setCantoWordsByEpisode((current) => ({ ...current, [episode.id]: body.words }))
    setTranscribeState({ working: false, error: null })
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

  async function markSegmentEnd() {
    if (!episode || !anchorsSet) return
    const anchors = episode as DubEpisode & EpisodeAnchors
    const cantoEnd = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishEnd = englishTimeFor(cantoEnd, anchors)

    const previousEnd = segments.length > 0 ? segments[segments.length - 1].cantoEnd : anchors.cantoContentStart
    const nextWordStart = findNextWordStart(cantoWords, previousEnd, anchors.cantoContentEnd)
    const cantoStart = nextWordStart ?? previousEnd
    const englishStart = englishTimeFor(cantoStart, anchors)

    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cantoStart, cantoEnd, englishStart, englishEnd }),
    })
    if (response.ok) {
      const { segment } = await response.json()
      setSegmentsByEpisode((current) => ({
        ...current,
        [episode.id]: [...(current[episode.id] ?? []), segment],
      }))
    }
  }

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
              </div>
            </div>
            {!anchorsSet && <p className="text-gray-500 mb-4">Set anchors before marking segments.</p>}

            <div className="flex gap-2 mb-4">
              <button onClick={runTranscribeCanto} disabled={transcribeState.working} className="border p-2 rounded">
                {transcribeState.working ? 'Transcribing…' : 'Transcribe Cantonese'}
              </button>
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
              <button onClick={markSegmentEnd} disabled={!anchorsSet} className="border p-2 rounded">
                Mark segment end
              </button>
            </div>

            {transcribeState.error && (
              <p role="alert" className="text-red-600 mb-4">
                {transcribeState.error}
              </p>
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
            />
          </>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/app/dub-sync/admin/admin.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 6: Run the full suite, type-check, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests pass. `npx tsc --noEmit` may report pre-existing errors unrelated to this change in `*.test.tsx` files (confirmed pre-existing during the auto-mark work earlier this branch — not something this plan touches); confirm no *new* errors appear in `admin.tsx`, `admin.test.tsx`, or `page.tsx`. `npm run lint` must be fully clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/dub-sync/admin/page.tsx src/app/dub-sync/admin/admin.tsx src/app/dub-sync/admin/admin.test.tsx
git commit -m "feat: replace manual/auto-mark UI with synced playback marking"
```

---

## After All Tasks: Manual QA

Before finishing the branch, start the dev server, apply migration `0006_create_dub_canto_words.sql` to the Supabase project, and manually verify in the browser:
1. "Transcribe Cantonese" downloads/transcribes/persists words (check the button's working state and that it completes without error).
2. "Play synced" starts both videos and pauses them together with "Pause synced".
3. Let synced playback run for 30+ seconds and confirm the English video occasionally snaps to stay roughly aligned (watch for the drift-correction seeks, e.g. by eye or by adding a temporary console.log).
4. "Mark segment end" pressed a few times in a row while playing creates several segments with plausible, non-overlapping `cantoStart`/`cantoEnd` ranges in the segment table (this is the exact defect that started this rework — confirm it's actually fixed).
5. The segment table's existing inline editing still works on the newly created segments.
