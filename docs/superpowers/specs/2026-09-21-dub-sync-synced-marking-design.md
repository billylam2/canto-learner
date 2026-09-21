# Dub Sync Synced Marking Design

## Purpose

Live QA of the auto-mark pipeline (`docs/superpowers/specs/2026-09-21-dub-sync-admin-design.md`) found that Google Cloud Speech-to-Text's speaker diarization is unusable for this feature: it doesn't support Cantonese (`yue-Hant-HK`) at all, in any model, and even on the English side its turn boundaries are noisy and non-deterministic across runs of the identical audio — the same clip produced 20, 8, and 17 turns on three separate calls, and the 8-turn run merged several real speaker turns into one 80-second blob. No amount of picking-the-better-side fixes this; the underlying turn-detection is unreliable. This spec retires the diarization-based auto-mark pipeline and replaces it with a synced-playback manual marking flow: both videos play together, and creating a segment is a single button press per line rather than automatic guesswork.

## Decisions

- **Removed**: the "Auto-mark from speech" button and route (`POST /api/dub-sync/episodes/[episodeId]/auto-mark`), `pair-diarized-turns.ts`, `group-words-by-speaker.ts`, `candidate-segments.ts`'s `englishCuesToCandidateSegments`, and `normalize.ts`'s `cantoTimeFor` (both added this session specifically for the diarization fallback and have no other caller). English-side transcription is dropped entirely; nothing about the English audio is downloaded or sent to Speech-to-Text anymore.
- **Kept as-is**: `candidate-segments.ts`'s `cuesToCandidateSegments` (canto-cue path) — `generate-segments` still depends on it for caption-based segment creation, which is unrelated to diarization and unaffected by this change. Likewise `downloadAudio`, the GCS upload, and the forced-16kHz-mono fix in `src/lib/dub-sync/transcribe.ts` — still needed, just for one-sided Cantonese transcription now. The content anchors (`Mark content start/end`, `englishTimeFor` in `normalize.ts`) are unchanged and remain the basis for keeping English in sync. "Generate from captions" is unrelated to diarization (it reads native YouTube caption cues, not Speech-to-Text output) and is unaffected.
- **`transcribeWithDiarization` is renamed `transcribeWords`** and no longer requests `diarizationConfig` — diarization was the one part of that config that never worked for this feature's purposes, so the request is simplified to just word-level timestamps. Its return type drops `speakerTag`; `TranscribedWord` becomes `{ text, startTime, endTime }`.
- **New persisted data**: a `dub_canto_words` table (`episode_id`, `text`, `start_time`, `end_time`) holds the one-time Cantonese transcription per episode. A **"Transcribe Cantonese"** button (replacing auto-mark's slot in the admin UI) runs `downloadAudio` + `transcribeWords` and replaces that episode's stored words (delete-then-insert, so re-running it after fixing an anchor or re-recording overwrites cleanly rather than accumulating duplicates). The admin page's initial data fetch loads each episode's persisted words alongside its segments.
- **Synced playback**: a "Play synced" / "Pause synced" toggle calls `playVideo()`/`pauseVideo()` on both players. While playing, a ~1s interval reads the Cantonese player's current time, computes the target English time via `englishTimeFor`, and re-seeks the English player only if it has drifted from that target by more than a small threshold (0.75s) — avoiding constant micro-seeks while still correcting drift. English's `playbackRate` is never touched (YouTube's IFrame API only supports discrete steps like 0.5/0.75/1/1.25, which would audibly distort speech).
- **Marking a segment**: replaces the old "Mark start" / "Mark end" / "Save segment" three-button flow with a single **"Mark segment end"** button, usable while synced playback is running (pressing it does not pause playback — you keep watching and press again for the next line):
  - `cantoEnd` = the Cantonese player's current time at press time.
  - `englishEnd` = `englishTimeFor(cantoEnd)`.
  - `cantoStart` = the earliest persisted word whose `start_time` is `>=` the previous segment's `cantoEnd` (or `>=` the episode's `cantoContentStart` anchor, for the first segment) **and** `<= cantoContentEnd` — the upper bound matters because without it, a lookup near the end of the marked content could return a word from the video's outro/credits and silently produce a nonsensical segment. If no such word exists (transcription gap, or genuinely no more speech before the content end), `cantoStart` falls back to the previous segment's `cantoEnd` (or the content-start anchor for the first segment) — segment creation is never blocked; the value can be corrected later in the segment table.
  - `englishStart` = `englishTimeFor(cantoStart)`.
  - The segment is created immediately via the existing `POST /api/dub-sync/episodes/[episodeId]/segments` route — no new segment-creation endpoint needed; the client computes all four values from already-loaded data (persisted words + existing segments + anchors) exactly as the old Mark-start/Mark-end flow computed `englishStart`/`englishEnd` client-side.

## Data Model

New migration `supabase/migrations/0006_create_dub_canto_words.sql`:

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

Applying it is a manual step for the operator (same pattern as the existing `DUB_SYNC_GCS_BUCKET`/`DUB_SYNC_ADMIN_PASSWORD` setup) — the README's "Dub Sync admin tool" section gets a line documenting it.

`src/lib/db/dub-sync.ts` gains, following its existing snake_case-row / camelCase-domain-type convention:

```ts
export interface CantoWord {
  id: string
  episodeId: string
  text: string
  startTime: number
  endTime: number
}

export async function replaceCantoWords(
  supabase: SupabaseClient,
  episodeId: string,
  words: Array<{ text: string; startTime: number; endTime: number }>
): Promise<CantoWord[]>

export async function listCantoWords(supabase: SupabaseClient, episodeId: string): Promise<CantoWord[]>
```

`replaceCantoWords` deletes all existing rows for `episodeId` and bulk-inserts the new set in one call (mirroring `createSegmentsBulk`'s bulk-insert shape), ordered by `start_time` implicitly via a query-time `order('start_time')` in `listCantoWords` rather than a stored position column (words don't get individually reordered/edited the way segments do).

## API

**`POST /api/dub-sync/episodes/[episodeId]/transcribe-canto`** (admin-only, replaces `auto-mark`):
1. Require admin session (401 if missing).
2. Fetch the episode; 404 if missing.
3. `downloadAudio(episode.cantoneseVideoId)` → `transcribeWords(path, 'yue-Hant-HK')` → `deleteAudioFile(path)` in a `finally` (same transient-file discipline as today).
4. `replaceCantoWords(supabase, episodeId, words)`.
5. Respond `{ words }` (201) or `{ error }` (502) on download/transcription failure, matching auto-mark's existing error-wrapping style (`` `Cantonese video (${videoId}) failed: ${message}` ``).

No other route changes. `GET` admin page load additionally calls `listCantoWords` per episode (parallel to the existing `listSegments` per episode) and passes the result down to the client component.

## Component Changes

`src/app/dub-sync/admin/admin.tsx`:
- Remove entirely: `runAutoMark`, `autoMarkState`, the "Auto-mark from speech" button, the old `markSegmentStart`/`markSegmentEnd`/`saveSegment` trio and `pendingSegment` state, and the "Mark start" / "Mark end" / "Save segment" buttons.
- Add: `cantoWordsByEpisode` state (parallel to `segmentsByEpisode`, seeded from the page's initial fetch); `runTranscribeCanto` (calls the new route, updates `cantoWordsByEpisode`, shows a working/error state the same way `runAutoMark` did); `syncing` boolean state; a `startSyncedPlayback`/`stopSyncedPlayback` pair wired to the "Play synced"/"Pause synced" toggle, using a `setInterval` ref cleared on stop/unmount; a new `markSegmentEnd` handler (unrelated to and replacing the old function of the same name above — this one implements the single-button `cantoStart`-lookup logic described in Decisions, then POSTs to the existing segments route exactly as the old `saveSegment` did).
- The "Mark content start/end" anchor-marking buttons are unaffected. "Transcribe Cantonese" doesn't need anchors (it transcribes the whole video) and stays enabled unconditionally; "Play synced" and "Mark segment end" do need anchors (`englishTimeFor` throws on an invalid/unset span) and stay gated behind `anchorsSet`, matching the existing `disabled={!anchorsSet}` pattern already used for the old marking buttons.

## Testing

- `src/lib/db/dub-sync.test.ts`: `replaceCantoWords` (deletes existing + inserts new, ordering) and `listCantoWords`.
- `src/lib/dub-sync/transcribe.test.ts`: update for the `transcribeWords` rename and dropped `diarizationConfig`/`speakerTag` (existing GCS/sample-rate tests are otherwise unaffected).
- New route test for `transcribe-canto` (mirroring `auto-mark/route.test.ts`'s structure, minus the pairing/fallback cases which no longer apply): auth check, episode-not-found, download failure, transcription failure, success.
- `admin.test.tsx`: replace the old mark-start/mark-end/save-segment and auto-mark test cases with tests for `runTranscribeCanto`, the synced-playback toggle (asserting `playVideo`/`pauseVideo` calls on both players and that the periodic re-seek only fires past the drift threshold — the interval itself can be driven with `vi.useFakeTimers()`), and `markSegmentEnd` (matched-word case, no-previous-segment case, no-word-found fallback case).
- Deleted: `pair-diarized-turns.test.ts`, `group-words-by-speaker.test.ts`, `auto-mark/route.test.ts`, and `normalize.test.ts`'s `cantoTimeFor` describe block (their subjects are removed). `candidate-segments.test.ts` keeps its `cuesToCandidateSegments` coverage (still used by `generate-segments`) and drops only its `englishCuesToCandidateSegments` describe block.

## Out of Scope

- Editing/re-ordering the persisted Cantonese words themselves (they're an internal lookup aid, not user-facing content — only segments are shown/edited in the segment table).
- Any equivalent synced-marking aid for videos where content anchors haven't been set yet (unchanged: anchors are still a prerequisite, same as today).
