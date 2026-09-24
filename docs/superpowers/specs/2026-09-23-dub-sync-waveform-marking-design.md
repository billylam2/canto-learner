# Dub Sync Waveform Marking Design

## Purpose

This session spiked three different ways to automate dub-sync segment creation — speaker diarization, gap-based segmentation from Speech-to-Text word timestamps, and raw-audio silence detection (VAD) — against episode 1's real audio. All three failed in different, informative ways: diarization doesn't support Cantonese and is non-deterministic; STT word timestamps collapse almost all real pauses to ~0s, so there's no usable gap signal; raw VAD finds real pauses but can't tell a mid-sentence breath from a line boundary, over-segmenting badly. None of them replace human judgment about where a line actually starts and ends.

The current fallback — hold-down-space during synced playback — depends on human reaction time, which the admin has found both slow and imprecise even with the existing 1-second reaction-time offset compensation. This spec replaces *reaction-time-based* marking with *visual* marking: an admin can see each dub's audio waveform and drag directly over the exact pause boundaries, at whatever zoom level makes them clearly visible, with no realtime-playback timing pressure at all. It's added as a **second, independently toggleable marking mode** alongside the existing spacebar flow (session-only choice, not persisted) so the admin can compare the two in practice before deciding whether to keep, replace, or drop either one.

Unlike the STT/VAD spikes, this needs no Google Cloud Speech-to-Text or Storage — waveform peaks are computed entirely locally from the already-proven `yt-dlp` audio download, via `ffmpeg` decoding to raw PCM. No GCP dependencies are reintroduced.

## Decisions

- **Independent per-track marking**: dragging on the Cantonese waveform sets `cantoStart`/`cantoEnd`; dragging on the English waveform independently sets `englishStart`/`englishEnd`. Neither is computed from the other via `englishTimeFor` — this is the whole point, since the formula's residual drift between checkpoints is exactly the imprecision this feature exists to avoid. `englishTimeFor` (checkpoint-aware) is still used, but only as a *navigation aid* (see below), never to compute a saved value.
- **Two-step pending-then-confirm workflow**: confirming a drag on one track holds that track's two timestamps in local component state only — nothing is saved. Only once *both* tracks have a confirmed pending selection does the pair combine into one `POST .../segments` call, identical in shape to today's spacebar/caption flows. Navigating away, switching episodes, or switching marking modes with one side still pending discards it silently — no partial segment rows, no schema/API changes needed to support partial state.
- **Already-marked shading**: both waveform tracks shade over any time-range already covered by a saved segment — computed straight from the same `segments` array already in the admin page's React state (regardless of which mode created each segment), so an admin doesn't accidentally re-drag a line that's already done.
- **English auto-scroll, independently overridable**: whenever the Cantonese track's visible window moves, the English track's view re-centers on `englishTimeFor(cantoViewCenterSeconds, anchors, checkpoints)`, where `cantoViewCenterSeconds` is derived from the canto track's own `viewStartSeconds` plus half its visible-duration (there's no separately-stored "center" value — `viewStartSeconds` is the single source of truth per track). The admin can then scroll the English track independently to nudge to the exact spot — that manual position holds until the Cantonese view moves again, which re-syncs it. Same defensive try/catch as `computeResyncTarget`: if the anchors are momentarily invalid (e.g. mid-edit), the sync is silently skipped for that tick rather than throwing — independent per-track dragging still works fine without it.
- **Pan vs. select**: scroll/trackpad gestures pan the view; a plain click-drag directly on the waveform always starts a new selection. No modifier keys. A shared zoom control (a simple pixels-per-second value) scales both tracks' timescale together, so precision is available at any zoom level.
- **Canvas rendering, not SVG**: each track draws on `<canvas>`, redrawn on every pan/zoom tick — cheaper than diffing thousands of SVG nodes continuously, and it's the standard approach for waveform viewers.
- **Peaks precomputed server-side, on demand**: a **"Generate waveforms"** button (same UI convention as "Refine precision"/"Generate from captions") triggers one route that downloads both videos' audio via `yt-dlp`, decodes each to raw PCM via `ffmpeg`, downsamples to a compact per-episode peak array (~50ms buckets — a few KB per track, not the multi-MB audio itself), stores it, and deletes the temp audio files. Re-clicking regenerates and overwrites — useful after editing an episode's video IDs. Peaks load alongside segments/checkpoints in the admin page's existing initial server-side fetch, so viewing the page needs no extra client round-trip.
- **Mode toggle is session-only, per the earlier decision**: a plain React boolean in `admin.tsx` (not persisted, no migration), showing either the existing spacebar panel or the new waveform panel. Both write to the same `dub_segments` table, so switching mid-episode is always safe.

## Data Model

New migration `supabase/migrations/0009_create_dub_sync_waveforms.sql`:

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

The `unique (episode_id, language)` constraint plus a delete-then-insert on regenerate (mirroring the old `replaceCantoWords` pattern) means "Generate waveforms" is naturally idempotent — re-running it cleanly replaces both rows rather than accumulating duplicates.

`src/lib/db/dub-sync.ts` gains:

```ts
export interface DubWaveform {
  id: string
  episodeId: string
  language: 'canto' | 'english'
  peaks: number[]
}

export async function listWaveforms(supabase: SupabaseClient, episodeId: string): Promise<DubWaveform[]>

export async function replaceWaveforms(
  supabase: SupabaseClient,
  episodeId: string,
  waveforms: Array<{ language: 'canto' | 'english'; peaks: number[] }>
): Promise<DubWaveform[]>
```

`replaceWaveforms` deletes all existing rows for `episodeId` and bulk-inserts the new pair in one call, mirroring `createSegmentsBulk`'s bulk-insert shape.

## Audio Download and Peak Extraction

Two files recovered from git history (commit `98a9676~1`, before the transcription pipeline was fully removed) and adapted — only the `yt-dlp` download half, **not** the Speech-to-Text/GCS half, which this feature doesn't need:

`src/lib/dub-sync/spawn-process.ts` (recovered as-is — Node's `child_process` mocks unreliably direct in this project's Vitest setup, per its original comment):
```ts
export { spawn } from 'node:child_process'
```

`src/lib/dub-sync/download-audio.ts` (recovered `downloadAudio`/`deleteAudioFile` from the old `transcribe.ts`, unchanged, renamed since it's no longer transcription-specific):
```ts
export async function downloadAudio(videoId: string): Promise<string>
export async function deleteAudioFile(filePath: string): Promise<void>
```

New file `src/lib/dub-sync/waveform.ts`:

```ts
import { spawn } from './spawn-process'

const SAMPLE_RATE = 8000 // amplitude-only peaks don't need speech-quality rate; keeps ffmpeg output small
const BUCKET_MS = 50

export async function extractWaveformPeaks(audioFilePath: string): Promise<number[]> {
  const pcm = await decodeToPcm(audioFilePath)
  const samplesPerBucket = Math.round((SAMPLE_RATE * BUCKET_MS) / 1000)
  const peaks: number[] = []
  for (let i = 0; i < pcm.length; i += samplesPerBucket) {
    let maxAbs = 0
    for (let j = i; j < Math.min(i + samplesPerBucket, pcm.length); j++) {
      maxAbs = Math.max(maxAbs, Math.abs(pcm[j]))
    }
    peaks.push(Math.round((maxAbs / 32768) * 1000) / 1000) // normalized 0..1, 3 decimal places
  }
  return peaks
}

function decodeToPcm(audioFilePath: string): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-i', audioFilePath,
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', String(SAMPLE_RATE),
      '-ac', '1',
      'pipe:1',
    ])
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => reject(new Error(`ffmpeg not found or failed to start: ${error.message}`)))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
      const buffer = Buffer.concat(chunks)
      resolve(new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2))
    })
  })
}
```

At ~50ms buckets, a 5-minute episode is ~6000 peak values — a few KB as JSON, comfortably small to load with the rest of the admin page's initial data.

## API

**`POST /api/dub-sync/episodes/[episodeId]/waveforms`** (admin-only):
1. Require admin session (401 if missing).
2. Fetch the episode; 404 if missing.
3. For each of `cantoneseVideoId`/`englishVideoId`: `downloadAudio` → `extractWaveformPeaks` → `deleteAudioFile` in a `finally` (same transient-file discipline as the old transcription pipeline). 502 with a clear message (`` `Cantonese audio (${videoId}) failed: ${message}` ``) if either download/decode fails.
4. `replaceWaveforms(supabase, episodeId, [{language: 'canto', peaks: cantoPeaks}, {language: 'english', peaks: englishPeaks}])`.
5. Respond `{ waveforms }` (201).

No anchor/checkpoint prerequisite — waveform generation only needs the video IDs, same as "Generate from captions" needing anchors is unrelated to this.

`GET` admin page load additionally calls `listWaveforms` per episode (parallel to `listSegments`/`listResyncCheckpoints`) and passes the result down to `Admin`.

## Component Changes

New files under `src/app/dub-sync/admin/`:

- **`waveform-track.tsx`** — a single track: owns its own `<canvas>`, draws the peaks array at the given `pixelsPerSecond`/`viewStartSeconds`, handles scroll-to-pan and click-drag-to-select, renders the current pending selection (if any) and the already-marked shading (computed from a `markedRanges: Array<{start: number; end: number}>` prop). Props: `peaks`, `pixelsPerSecond`, `viewStartSeconds`, `onViewStartChange`, `markedRanges`, `pendingSelection`, `onSelectionConfirmed(start, end)`, `onSelectionCancelled()`. Knows nothing about Cantonese/English or segments — purely a reusable waveform widget.
- **`waveform-marking.tsx`** — the panel shown when the toggle is in waveform mode. Renders two `WaveformTrack`s (canto/english), owns the shared `pixelsPerSecond` zoom state and each track's `viewStartSeconds`, the auto-scroll-sync effect (english's `viewStartSeconds` follows `englishTimeFor` whenever canto's changes, until the admin manually scrolls english again), the two independent `pendingSelection` states, and `confirmSegment()` (fires the combined POST once both sides are confirmed, mirroring the spacebar flow's segment-creation and `onSegmentCreated` callback shape). Props: `episodeId`, `cantoPeaks`, `englishPeaks`, `anchors`, `checkpoints`, `segments`, `onSegmentCreated`.

`src/app/dub-sync/admin/admin.tsx`:
- Add `waveformsByEpisode` state (parallel to `segmentsByEpisode`/`checkpointsByEpisode`), a `markingMode: 'spacebar' | 'waveform'` state (default `'spacebar'`, session-only), and a "Generate waveforms" button + its own loading/error state, matching the "Refine precision" button's pattern.
- The mode toggle (two buttons, as shown in the approved mockup) renders above the sync controls; when `markingMode === 'waveform'`, render `WaveformMarking` instead of the existing "Play synced"/spacebar-instruction block. `AnchorFields`, `CheckpointTable`, and `SegmentTable` are unaffected either way.

`src/app/dub-sync/admin/page.tsx`: adds a `listWaveforms` loop building `waveformsByEpisode`, passed to `Admin` alongside the other per-episode maps.

## Testing

- `src/lib/dub-sync/waveform.test.ts`: `extractWaveformPeaks` against a synthetic PCM buffer (known amplitude pattern) — correct bucket count, correct normalized peak values, silence produces near-zero peaks.
- `src/lib/db/dub-sync.test.ts`: `listWaveforms`, `replaceWaveforms` (delete-then-insert, both rows returned).
- New route test for `waveforms/route.ts` (mirroring the old `transcribe-canto` route test's structure): auth check, episode-not-found, download failure, decode failure, success shape.
- `waveform-track.test.tsx`: given a peaks array and view window, drag gestures produce the expected `onSelectionConfirmed(start, end)` call in track-local seconds; scroll changes `viewStartSeconds` via `onViewStartChange`; a `markedRanges` entry renders (smoke-level, not pixel-perfect) without throwing. Canvas pixel output itself is not asserted — covered by manual verification instead, per the design discussion.
- `waveform-marking.test.tsx`: confirming only the Cantonese side does not POST; confirming both sides POSTs the combined segment and calls `onSegmentCreated`; switching episodes or `markingMode` away with one side pending clears it without a request; English's `viewStartSeconds` follows `englishTimeFor(cantoViewCenter)` when canto's view changes, and stops following after a manual English scroll until canto's view changes again.
- `admin.test.tsx`: the mode toggle switches which panel renders; "Generate waveforms" posts to the new route and populates `waveformsByEpisode`; error state on failure (mirroring "Refine precision"'s error handling).

## Out of Scope

- Deciding whether to keep, drop, or fully replace the spacebar flow — that's the explicit purpose of the toggle: try both in practice first.
- Deleting the old `transcribe.ts`/GCS/Speech-to-Text removal's leftover npm dependencies or bucket — unaffected either way, since this feature never uses them.
- Waveform peak caching/invalidation beyond "re-click regenerates" — no automatic regeneration on video-ID edit, no staleness warning if peaks are out of date relative to the current video ID.
- Any zoom/pan persistence across page reloads — resets to a default view each time, same as the existing player's lack of playback-position persistence.
