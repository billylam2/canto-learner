# Dub Sync Design

## Purpose

A personal tool for comparing two independently-dubbed YouTube videos of the same content (starting with Cantonese/English Peppa Pig episodes from a specific channel) segment by segment. It lets you play a short section of speech in one language, then immediately hear the corresponding section in the other — either by pressing a button on demand, or by having both languages play back to back automatically. It is unrelated to the existing kids' vocab app beyond sharing this repo, deploy, and Supabase project; nothing here is linked from or visible in the kids' app UI.

## Decisions

- **Scope:** a standalone tool, not a feature of the kids' app. Lives under a new route section, `src/app/dub-sync/`, in the existing single Next.js app — no monorepo/workspace changes.
- **Video playback:** the YouTube IFrame Player API, embedding the actual videos. No downloading or local storage of video/audio.
- **Alignment approach:** linear (proportional) time normalization between two manually-marked anchor points per video, per episode — not caption-based or translation-based matching. This was chosen over auto-aligning via YouTube auto-captions because caption availability/quality for Cantonese is unreliable, and because dub scripts diverge enough (reordered/merged/cut lines) that automatic cross-language line-matching would only ever be a rough first pass anyway. The proportional approach is far simpler to build (no captions API, no translation API, no matching algorithm) and produces an equally reasonable starting guess, which is always manually adjustable per segment.
- **Storage:** two new tables in the existing Supabase project, isolated from the kids' app's tables.
- **Auth:** none. The route is unlisted (not linked from the kids' app) and this is single-user personal use, so no login gate.

## Data model

**`dub_episodes`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `title` | text | free-text label, e.g. "Peppa Pig — Muddy Puddles" |
| `cantonese_video_id` | text | YouTube video ID |
| `english_video_id` | text | YouTube video ID |
| `canto_content_start` | numeric, nullable | seconds; set via the editor |
| `canto_content_end` | numeric, nullable | seconds |
| `english_content_start` | numeric, nullable | seconds |
| `english_content_end` | numeric, nullable | seconds |

The four `*_content_*` anchor fields mark where actual episode dialogue begins/ends in each video, skipping intro/outro bumpers (which differ in length between the two channels). They start `null` and must all be set before any segment can be added.

**`dub_segments`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `episode_id` | uuid, FK → `dub_episodes.id` | |
| `order` | integer | display/playback order within the episode |
| `label` | text, nullable | optional free-text note, e.g. "Peppa says hello" |
| `canto_start` | numeric | seconds |
| `canto_end` | numeric | seconds |
| `english_start` | numeric | seconds |
| `english_end` | numeric | seconds |

Segments are always authored against the Cantonese video. `english_start`/`english_end` are initially proposed by linear interpolation between the episode's anchors:

```
english_t = english_content_start +
  (canto_t - canto_content_start) / (canto_content_end - canto_content_start)
  * (english_content_end - english_content_start)
```

The proposed values are then adjustable before saving. Once saved, `english_start`/`english_end` are the authoritative values used at playback time — they are never recomputed on the fly, only recomputed when you explicitly re-derive them in the editor.

This mapping assumes roughly even pacing across the episode, so segments away from the anchors may drift more than ones near them; the manual adjustment step in the editor exists specifically to correct that per segment.

## Editor workflow

`src/app/dub-sync/page.tsx` — episode list. An "add episode" form takes a title and the two YouTube video IDs/URLs, creating a `dub_episodes` row with null anchors.

`src/app/dub-sync/[episodeId]/editor/page.tsx` — per-episode editor, with both YouTube IFrame embeds (Cantonese + English) visible side by side:

1. **Set anchors** (once per episode, required before adding segments): scrub each player to where dialogue actually starts/ends, click "Mark content start" / "Mark content end" for that player. Persists the four anchor fields.
2. **Add a segment**: scrub the Cantonese player, click "Mark start," let it play to the end of the line/phrase, click "Mark end." The tool computes the proposed English `[start, end]` via the formula above and seeks the English player there so it can be previewed immediately.
3. **Adjust if needed**: nudge buttons (±0.5s) or direct scrub-and-remark on the English player to override the proposed boundary before saving.
4. **Save**, with an optional label. Saved segments are listed below in order, each with play/edit/delete controls.

## Player

`src/app/dub-sync/[episodeId]/page.tsx` — one YouTube IFrame player visible at a time (starts on Cantonese), with the segment list (label or index) below it.

State: current segment, current language (`canto` | `english`).

- **Play** (per segment): seeks the active-language player to that segment's `[start, end]` and calls `playVideo()`. Since the YouTube IFrame API has no native "stop at timestamp," an interval polls `getCurrentTime()` while playing and calls `pauseVideo()` once it passes `end`.
- **Switch language** (button): pauses the current player, swaps the visible/active player (Cantonese ⇄ English), seeks to the *same segment's* boundaries in the new language, and plays.
- **Play both** (per segment): plays the Cantonese clip; when the pause-at-end polling fires, automatically switches the active player to English and immediately plays the English clip for the same segment — no button press needed in between. Reuses the same polling-pause mechanism as **Play**, chained once instead of stopping.
- The segment list stays visible throughout, so segments can be jumped to directly rather than only stepped through sequentially.

## Error handling

- YouTube player errors (video unavailable, private, etc.) surface as a simple inline message. No retry or fallback logic — this is a personal tool, and a visible error is sufficient.
- The editor disables "Mark start" for segments until all four anchors are set, avoiding a divide-by-zero in the interpolation formula.

## Testing approach

- Unit tests for the interpolation formula (`englishTimeFor(cantoT, anchors)`), including edge cases at the anchor boundaries.
- Unit tests for the pause-at-segment-end polling logic and the "Play both" chaining, using a mocked YouTube player.
- Manual QA via `claude-in-chrome`: create an episode, set anchors, add a couple of segments, and verify Play / Switch language / Play both all behave correctly against real embedded videos.
