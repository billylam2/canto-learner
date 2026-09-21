# Dub Sync Admin Design

## Purpose

The dub-sync editor currently requires every segment to be marked by hand, and "Generate from captions" only works for videos that happen to have a native YouTube caption track — which this project's actual target videos (a Cantonese-dub channel with burned-in, not native, captions) don't have. This spec replaces manual/caption-based segment creation with a speech-to-text + speaker-diarization pipeline that transcribes the Cantonese audio directly, and consolidates all content-management actions (episode creation, anchors, auto-marking, segment editing) into a single password-gated admin page, separate from the open, unauthenticated player.

## Decisions

- **Transcription pipeline**: download the Cantonese video's audio temporarily via `yt-dlp` (a CLI tool, not an npm package — must be installed wherever the Next.js server runs), send it to Google Cloud Speech-to-Text with `languageCode: 'yue-Hant-HK'` and speaker diarization enabled, group consecutive words by speaker tag into segments, and delete the audio file immediately after. Nothing about the audio is kept or served — only the resulting timestamps are saved.
- **English alignment stays proportional**: segment English `[start, end]` times are still computed via the existing `englishTimeFor` linear-normalization formula, not a second transcription pass on the English video. This keeps the pipeline to one transcription call per episode; revisit only if accuracy remains a problem after this change.
- **Trigger**: a single button ("Auto-mark from speech") on the admin page runs the entire pipeline server-side in one request — no separate CLI commands for the user to run.
- **Admin auth**: a single shared password in a new `DUB_SYNC_ADMIN_PASSWORD` env var, checked by a new login route, backed by an `iron-session` cookie (mirroring the existing kids'-app session pattern in `src/lib/auth/session.ts`, but a distinct cookie/session, reusing the existing `SESSION_SECRET`). No accounts, no email — this is a personal single-operator tool.
- **Gate scope**: everything that creates or edits content (episode list/creation, anchors, auto-mark, segment table) lives behind the login. The player (`/dub-sync/[episodeId]`) stays fully open, since it's what gets used casually on any device.
- **Page consolidation**: `/dub-sync/[episodeId]/editor` is removed. All admin actions move to one page, `/dub-sync/admin`, with an episode switcher so multiple episodes can be edited in one sitting without navigating back to a list each time. The existing `/dub-sync` route becomes a plain, unauthenticated episode list linking only to the player (no edit/add affordances).
- **No new tables**: `dub_episodes` and `dub_segments` are unchanged. The admin password isn't stored anywhere — it's compared directly against the env var at login.

## Admin auth

New module `src/lib/auth/admin-session.ts`, structurally mirroring `src/lib/auth/session.ts`:

```ts
export interface AdminSessionData {
  isAdmin: true
}
export const ADMIN_COOKIE_NAME = 'dub_sync_admin_session'
// createAdminSessionCookieValue, readAdminSessionFromCookieValue, readAdminSession,
// setAdminSessionCookie, clearAdminSessionCookie — same shapes as session.ts,
// reusing SESSION_SECRET (already required to be 32+ chars) rather than a new secret.
```

- **`POST /api/dub-sync/login`**: body `{ password: string }`. Compares against `process.env.DUB_SYNC_ADMIN_PASSWORD` (throws a clear startup-time-style error if that env var isn't set, same pattern as `getSessionPassword`). On match, sets the admin cookie and returns `{ ok: true }`; on mismatch, `401`.
- **`POST /api/dub-sync/logout`**: clears the admin cookie.
- **`src/app/dub-sync/login/page.tsx`**: a single password field + submit button, posting to the login route and redirecting to `/dub-sync/admin` on success; shows an inline error on `401`.
- **Gating**: every admin page and every mutating dub-sync API route (episode create, anchor update, segment create/update/delete/bulk-create, auto-mark) reads the admin session server-side first and returns `redirect('/dub-sync/login')` (pages) or `401` (API routes) if absent. A small helper, `requireAdminSession(request)` returning `AdminSessionData` or throwing a typed "unauthorized" result, avoids repeating this check in every route file.

## Auto-mark pipeline

New module `src/lib/dub-sync/transcribe.ts`:

```ts
export interface TranscribedWord {
  text: string
  startTime: number
  endTime: number
  speakerTag: number
}

export async function downloadAudio(videoId: string): Promise<string> // returns a temp file path
export async function transcribeWithDiarization(audioFilePath: string): Promise<TranscribedWord[]>
export function deleteAudioFile(path: string): Promise<void>
```

- `downloadAudio` shells out to `yt-dlp -x --audio-format mp3 -o <tmp>/%(id)s.%(ext)s https://www.youtube.com/watch?v=<videoId>` via Node's `child_process`, writing into `os.tmpdir()`. Throws a clear error (surfaced to the admin page) if `yt-dlp` isn't found on `PATH`.
- `transcribeWithDiarization` uses `@google-cloud/speech` (new dependency; auth via Application Default Credentials, same pattern as `createTtsClient()` in `src/lib/content/tts.ts` — no explicit key handling in code). Uses `longRunningRecognize` (required for audio over ~1 minute) with `enableSpeakerDiarization: true`, a `diarizationConfig` of `{ minSpeakerCount: 2, maxSpeakerCount: 6 }` (reasonable default for a kids' show's cast; not user-configurable in this first pass), and `enableWordTimeOffsets: true`. Flattens the response into `TranscribedWord[]`.

New pure module `src/lib/dub-sync/group-words-by-speaker.ts`:

```ts
export interface WordGroup {
  start: number
  end: number
}
export function groupWordsBySpeaker(words: TranscribedWord[]): WordGroup[]
```

Walks the word list in order; a change in `speakerTag` between consecutive words ends the current group and starts a new one. Each group's `start`/`end` are its first/last word's timestamps.

`WordGroup` (`{start, end}`) is a subset of `CaptionCue` (`{start, end, text}`) — and `cuesToCandidateSegments` never reads `.text`, only `.start`/`.end`. Rather than duplicate its anchor-filtering + `englishTimeFor` mapping logic for word groups, its parameter type is loosened from `CaptionCue[]` to a minimal local `{ start: number; end: number }[]` interface, so `WordGroup[]` satisfies it directly. `CaptionCue[]` callers (the existing generate-segments route) keep working unchanged, since `CaptionCue` still structurally satisfies the loosened type.

**`POST /api/dub-sync/episodes/[episodeId]/auto-mark`** (admin-only):
1. Require admin session (401 if missing).
2. Fetch the episode; 404 if missing, 400 if anchors aren't fully set (same check as the existing generate-segments route).
3. `downloadAudio(episode.cantoneseVideoId)` → `transcribeWithDiarization(path)` → `groupWordsBySpeaker(words)`, each step's failure returning a `502` with a message identifying which step failed (download vs. transcription).
4. Reuse `cuesToCandidateSegments`-style filtering/mapping (word groups have the same `{start, end}` shape captions cues do, so this can call the same anchor-filter-and-normalize logic, exposed as a small shared helper rather than duplicated) to produce `CreateSegmentInput[]`.
5. `createSegmentsBulk`, then delete the temp audio file in a `finally` block so cleanup happens even on error.
6. Returns `{ segments }` (201) on success.

Because a 5-minute video's download + transcription can take tens of seconds, the admin page shows a "Working…" state on the button (disabled, spinner or text change) for the duration of the request rather than looking frozen.

## Admin page (`/dub-sync/admin`)

Server component (`page.tsx`) requires the admin session (redirect to login if absent), fetches every episode **and** its segments up front (personal-scale data — a handful of episodes, not worth paginating or lazily fetching per switch), and passes it all to a client component.

Client component (`admin.tsx`) holds `selectedEpisodeId` state:
- **Episode switcher**: a list/sidebar of episode titles; clicking one updates `selectedEpisodeId` — no navigation, no refetch, just switching which preloaded episode's data is shown.
- **Add episode**: the existing `NewEpisodeForm`, adapted to append the created episode to local state and select it, instead of redirecting to a now-removed editor route.
- **Selected episode's panel**, top to bottom:
  - Anchor controls (unchanged from the current editor: two video embeds, "Mark content start/end" per video).
  - **"Auto-mark from speech"** button — calls the new auto-mark route, appends returned segments to local state, shows the "Working…" state described above, and surfaces the route's error message inline on failure (e.g. "yt-dlp not found" or a transcription failure).
  - **Segment table**: one row per segment — label, Cantonese start/end, English start/end, each as a number/text input that PATCHes that segment on blur (no separate "Edit mode" toggle, unlike the old editor's per-row edit affordance) — plus a Delete button per row.
  - **Manual add**: the existing "Mark start / Mark end / Save segment" flow (scrub the Cantonese video by hand), kept as-is underneath the table, for filling in anything auto-mark misses.

## Removed / changed

- `src/app/dub-sync/[episodeId]/editor/*` (page, client component, tests) is deleted, superseded by the admin page.
- `src/app/dub-sync/page.tsx` loses its `NewEpisodeForm` and edit links; it becomes a plain episode list linking only to `/dub-sync/[episodeId]` (the player). `NewEpisodeForm` itself moves to be used by the admin page instead.
- Existing mutating routes (`POST episodes`, `PATCH episodes/[id]`, `POST/PATCH/DELETE segments`, `POST generate-segments`) gain the `requireAdminSession` check; their existing behavior and response shapes are otherwise unchanged.

## Error handling

- Missing `DUB_SYNC_ADMIN_PASSWORD` at login time throws the same style of clear startup error as `getSessionPassword()` — not a silent failure.
- `yt-dlp` not installed/found: the auto-mark route returns a `502` with a message telling the admin to install it, surfaced verbatim in the admin page's error banner.
- Speech-to-Text failures (quota, unsupported audio, network) similarly return `502` with the underlying error message.
- Anchors not set: `400`, same as today's generate-segments route — the admin page's "Auto-mark from speech" button is disabled until anchors exist, same pattern as "Generate from captions" was disabled before.
- Segment table field edits that fail to save (network error, validation) leave the field showing the value the user typed with an inline error rather than silently reverting — avoids losing an edit.

## Testing approach

- Unit tests for `groupWordsBySpeaker` (speaker-tag change detection, single-speaker input, empty input) and for the admin-session module (mirroring `session.test.ts`'s coverage of `session.ts`).
- Unit tests for the auto-mark route with `downloadAudio`/`transcribeWithDiarization` mocked (following this repo's `vi.mock` convention for the DB layer), covering: success, missing anchors, episode not found, download failure, transcription failure, and the temp-file-cleanup-on-error path.
- Unit tests for the login/logout routes and for `requireAdminSession` gating an existing route (e.g. segment creation) when the admin cookie is absent.
- Component tests for the admin page's episode switcher, segment table inline editing, and auto-mark button's loading/error states, following the existing `player.test.tsx`/`editor.test.tsx` mocking patterns.
- No automated test can exercise the real `yt-dlp` + Speech-to-Text call end-to-end — that's covered by a manual QA pass (run auto-mark against a real episode, confirm segments appear and look reasonable, confirm the temp file is gone afterward).
