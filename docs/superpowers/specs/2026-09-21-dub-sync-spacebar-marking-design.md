# Dub Sync Spacebar Marking Design

## Purpose

The "Mark segment end" button (spec: `docs/superpowers/specs/2026-09-21-dub-sync-synced-marking-design.md`) still produced bad segments in live QA even after two real bugs in it were found and fixed (a transcription bug that discarded most of the transcript, and a stale-state race on rapid presses) — inferring a segment's start from the nearest transcribed word is inherently indirect and kept surfacing new edge cases. This spec replaces it with a direct, real-time interaction: hold the space bar down for exactly as long as a character/narrator is speaking, release when they stop. The segment's end is the release time; its start is half a second before the press, to account for reaction time. This captures both boundaries from the user's own live judgment while watching/listening, rather than inferring one of them from an automated (and repeatedly buggy) heuristic — so it also retires the entire transcription pipeline that only existed to support that heuristic.

## Decisions

- **Removed entirely** (nothing else in the app depends on any of it):
  - `markSegmentEnd`, the "Mark segment end" button, `nextSegmentStartFloorRef`'s word-inference role (see below for what's kept), and `findNextWordStart`/`next-word-start.ts`/its test.
  - The "Transcribe Cantonese" button, `runTranscribeCanto`, `transcribeState`, `cantoWordsByEpisode` state and prop, and `POST /api/dub-sync/episodes/[episodeId]/transcribe-canto` + its test.
  - `src/lib/dub-sync/transcribe.ts` and its test in full — `downloadAudio`, `uploadToGcs`, `deleteFromGcs`, `deleteAudioFile`, `transcribeWords`, `getGcsBucketName`, `TranscribedWord` — since the route above was their only caller.
  - `src/lib/dub-sync/spawn-process.ts` and `src/lib/dub-sync/fs-process.ts` (the Node-builtin mocking wrappers), which existed solely for `transcribe.ts`'s tests.
  - `CantoWord`, `CreateCantoWordInput`, `replaceCantoWords`, `listCantoWords` from `src/lib/db/dub-sync.ts`, and their tests; the `listCantoWords` call and `cantoWordsByEpisode` construction in `page.tsx`.
  - The `@google-cloud/speech` and `@google-cloud/storage` npm dependencies (confirmed unused anywhere else in the repo — the kids'-app text-to-speech pipeline uses the separate `@google-cloud/text-to-speech` package).
  - The `DUB_SYNC_GCS_BUCKET` env var and the `yt-dlp` requirement from `README.md`'s "Dub Sync admin tool" section and `.env.local.example`.
  - A new migration `supabase/migrations/0007_drop_dub_canto_words.sql` drops the table. (`0006_create_dub_canto_words.sql` stays in the repo as history — migrations that were already applied to a real database aren't rewritten, matching how this project already treats `supabase/migrations/` as an append-only log.)
- **Kept as-is**: content anchors (`Mark content start/end`, the new editable `AnchorFields` inputs, `englishTimeFor`), synced playback (`Play synced`/`Pause synced`, `computeResyncTarget`, the resync interval), "Go to content start", "Generate from captions" (caption-cue-based, unrelated to any of this), and the per-segment "Play" button. `nextSegmentStartFloorRef`'s synchronous-floor mechanism is kept, just fed a different computation (see below) instead of a word lookup.
- **The interaction**: space bar is the marking key, active only while synced playback (`syncing`) is running — elsewhere on the page (typing in the title field, editing a segment's label, etc.) space behaves normally. A `keydown`/`keyup` listener pair is attached to `window` only while `syncing` is true:
  - `keydown`: ignored unless `event.code === 'Space'` and it isn't a key-repeat event (`!event.repeat`, so holding the key doesn't re-trigger). Calls `event.preventDefault()` (stops page scroll and stops space from activating whatever button currently has focus, e.g. "Pause synced" itself). Reads the Cantonese player's current time, computes `pendingStart = Math.max(currentTime - 0.5, floor)` where `floor` is the same synchronous per-episode floor `markSegmentEnd` used to use (last segment's end, or the content-start anchor for the first segment) — clamping prevents an early/accidental press from creating an overlapping segment. Stores `pendingStart` in a ref (not state, so the value survives without waiting on a render).
  - `keyup`: ignored unless `event.code === 'Space'` and a `pendingStart` is actually pending (guards against a keyup with no matching keydown, e.g. if focus left the window mid-press). Calls `event.preventDefault()`. Reads the Cantonese player's current time as `cantoEnd`. If `cantoEnd <= pendingStart` — possible if the floor-clamp pushed `pendingStart` past the actual release time, e.g. the video was scrubbed backward between press and release — the press is discarded (no request sent, `pendingStart` cleared) rather than saving a nonsensical segment; this is the same "start after end" bug class hit twice already with the word-inference approach, so it's guarded here from the start rather than waiting to rediscover it live. Otherwise: computes `englishStart`/`englishEnd` via `englishTimeFor`, POSTs the segment to the existing `POST /api/dub-sync/episodes/[episodeId]/segments` route (unchanged — same as the old flow), and on success appends it via the existing `handleSegmentUpdated`-adjacent state update. Advances the floor ref to `cantoEnd` synchronously, same as before, so back-to-back presses (holding, releasing, pressing again for the next line) can't collide.
  - No new segment-creation endpoint — this reuses the same `POST .../segments` route the old flow used, just with `cantoStart`/`cantoEnd` computed from live key timing instead of a word lookup.
- **UI**: the "Mark segment end" button is replaced with a short instruction line, shown only while `syncing` is true: "Hold SPACE while a character is speaking, release when they stop." Nothing appears when synced playback isn't running, since the key only does something in that state.

## Component Changes

`src/app/dub-sync/admin/admin.tsx`:
- Remove: `runTranscribeCanto`, `transcribeState`, the "Transcribe Cantonese" button and its error display, `cantoWordsByEpisode` state and the `cantoWords` derived value, `markSegmentEnd`, `findNextWordStart` import, the "Mark segment end" button.
- Add: a `pendingSegmentStartRef = useRef<number | null>(null)`; a `useEffect` keyed on `[syncing, episode, anchorsSet]` that attaches/detaches the `keydown`/`keyup` listeners described above (parallel in structure to the existing resync-interval `useEffect`, and replacing `markSegmentEnd`'s body); the instruction line, rendered conditionally on `syncing`.
- `AdminProps` drops `cantoWordsByEpisode`.

`src/app/dub-sync/admin/page.tsx`: drops the `listCantoWords` loop and the `cantoWordsByEpisode` prop.

## Testing

- Deleted: `src/lib/dub-sync/transcribe.ts`/`.test.ts`, `src/lib/dub-sync/spawn-process.ts`, `src/lib/dub-sync/fs-process.ts`, `src/lib/dub-sync/next-word-start.ts`/`.test.ts`, the `transcribe-canto` route and its test, the `CantoWord`/`replaceCantoWords`/`listCantoWords` tests in `dub-sync.test.ts`.
- `admin.test.tsx`: replace the "Admin transcribe canto" describe block and the old "Admin mark segment end" click-based tests with `keydown`/`keyup`-driven tests (`fireEvent.keyDown(window, { code: 'Space' })` / `fireEvent.keyUp(window, { code: 'Space' })`) covering: a full press-release cycle producing the expected `cantoStart` (release time minus 0.5, computed via a controllable mock `getCurrentTime`) and `cantoEnd`; the floor-clamp case (pressing right after the previous segment's end, where an unclamped `-0.5` would go negative relative to it); the discard-on-`cantoEnd <= pendingStart` guard (no POST sent); a key-repeat `keydown` not restarting `pendingStart`; and that space does nothing when `syncing` is false. Every other existing describe block (`Admin`, `Admin synced playback`, `Admin play segment from the segment table`, anchor editing) is unaffected and stays as-is.

## Out of Scope

- Dropping the real `dub_canto_words` table in the user's Supabase project — the new migration file is provided, but applying it (like every other migration in this repo) is a manual step for the operator, not something done automatically.
- Any visual waveform/audio-scrubbing aid for finding exact press timing — this is a straightforward keyboard-timing capture, not a new audio-editing UI.
