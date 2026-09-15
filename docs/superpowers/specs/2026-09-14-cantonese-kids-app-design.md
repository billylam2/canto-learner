# Cantonese Learning App for Kids (Ages 3-6) — Design Spec

## Overview

A public, free-to-host web app that gamifies beginner Cantonese vocabulary
learning for children aged 3-6. Kids log in with a simple username/PIN (no
email required), play short audio-and-picture games, and earn stars that
unlock new levels and cosmetic rewards.

## Goals

- Teach beginner Cantonese vocabulary through listening and visual
  recognition, appropriate for pre-literate children.
- Make login frictionless for young children and their families: no email,
  no personal data collection beyond a username.
- Host the app for free, indefinitely, with minimal ongoing maintenance.
- Support an extensible reward system (cosmetics, pets, emojis, animations)
  that can grow over time without schema changes.
- Auto-deploy to production on every merge to `main`.

## Non-Goals

- Teaching reading/writing of Chinese characters or Jyutping romanization
  (data is stored for future use, but not shown to kids in the initial
  version).
- Speech recognition or pronunciation scoring.
- Parent accounts, multi-kid household grouping, or progress rollup across
  siblings (each kid has one independent, standalone account).
- Automated PIN recovery (no email means no recovery flow — see Login
  section).
- Social features (leaderboards, friending, chat) — usernames are unique
  but the app has no social surface in this version.

## Architecture

- **Framework**: Next.js (App Router) with TypeScript, single repo and
  single deployment.
- **Frontend**: React components render game screens; game logic
  (tapping, drag interactions, audio playback, animations) runs
  client-side for responsiveness.
- **Backend**: Next.js API routes (Vercel serverless functions) handle
  login/signup, fetching vocabulary/game content, saving progress, and
  reward unlocking.
- **Database**: Supabase Postgres stores kid accounts, vocabulary,
  levels, progress, and the reward catalog/inventory.
- **Asset storage**: Supabase Storage hosts audio clips and images,
  served directly to the browser via CDN URLs (not proxied through the
  API).
- **Deployment**: GitHub repository connected to Vercel. Every merge to
  `main` triggers an automatic production deploy; every branch/PR gets an
  automatic preview deploy.
- **Content pipeline**: An offline script (run locally, not part of the
  live app) generates TTS audio for vocabulary, uploads assets to
  Supabase Storage, and upserts content rows into the database. Rerunning
  it is idempotent, so individual audio files can later be swapped for
  real human recordings.

This architecture was chosen over two alternatives:

- **Django API + separate React frontend on Render/Railway** — rejected
  primarily because free-tier server hosts spin down after idle periods,
  causing slow cold-start responses that are a poor experience for young
  children waiting on a game to load. It also requires coordinating two
  separate deployments and CORS configuration.
- **Static-only frontend with localStorage accounts, no backend** —
  rejected because it doesn't provide real cross-device login; accounts
  would only exist per-browser, which doesn't meet the goal of a public
  app with genuine username/PIN accounts.

## Data Model

- **`kids`** — `id`, `username` (unique), `pin_hash`, `avatar_id`,
  `created_at`. No email or other personal information is collected.
- **`vocab_items`** — `id`, `cantonese_text`, `jyutping` (stored for
  future use), `english_gloss` (for content management only, never shown
  in-app), `audio_url`, `image_url`, `category`.
- **`levels`** — `id`, `name`, `order`, `unlock_threshold` (stars needed
  to unlock).
- **`level_vocab`** — join table linking `levels` to `vocab_items`.
- **`game_types`** — a small fixed, seeded set: `listen-and-tap`,
  `find-in-scene`, `memory-match`.
- **`scenes`** — `id`, `image_url`, `level_id`, used by the "find in the
  scene" game.
- **`scene_objects`** — tap-target regions/coordinates within a scene,
  each linked to a `vocab_item_id`.
- **`progress`** — `kid_id`, `level_id`, `stars_earned`,
  `completed_game_types` (which of the 3 game types have been cleared for
  that level), `updated_at`. Drives level unlocking.
- **`reward_items`** — the reward catalog: `id`, `type` (e.g. `cosmetic`,
  `pet`, `emoji`, `animation`), `slot` (e.g. `hat`, `pet`, `frame`,
  `background`, or `null` for non-equippable collectibles), `name`,
  `asset_url`, `unlock_cost` (stars) and/or `unlock_level_id`, and a
  flexible `metadata` JSON column for type-specific details. New reward
  categories are added as catalog rows, not schema changes.
- **`kid_inventory`** — `kid_id`, `reward_item_id`, `acquired_at`,
  `equipped` (bool). Tracks ownership and what's currently active;
  equipping an item unequips any other item in the same `slot`.

Usernames are globally unique across the entire app. PINs are hashed
(bcrypt) before storage and never stored or logged in plaintext.

## Login / Auth Flow

- **Sign-up**: Pick a username (checked for availability live, then
  re-checked server-side to avoid race conditions) and a 4-digit PIN.
  Usernames are filtered against a basic profanity/blocklist before
  acceptance.
- **Login**: Username + PIN submitted to an API route, verified against
  the stored hash, and a signed session cookie is issued using a
  lightweight session library (e.g. `iron-session`) rather than a full
  auth framework — those are built around email/OAuth flows this app
  doesn't need.
- **Session length**: Long-lived (30+ days) per device, since login is
  effectively a one-time setup step per device rather than something a
  young child should repeat often.
- **No PIN recovery**: Because there is no email, a forgotten PIN cannot
  be recovered automatically. This is an accepted limitation — a child
  who forgets their PIN creates a new account rather than the app
  building recovery infrastructure.
- **Rate limiting**: Failed login attempts are rate-limited (lockout
  after N attempts within a window) since usernames are public and PINs
  are short.

## Games

Each game type is a React component/route (e.g.
`/play/[levelId]/[gameType]`), sharing a common "round" wrapper that
selects vocab items to test from the level's list, tracks correct/
incorrect taps, awards stars at round end, and calls the progress API.

- **Listen & tap the picture**: Plays audio for a target word; kid taps
  the matching image among 2-4 choices. Incorrect taps prompt a gentle
  retry rather than a failure state.
- **Find it in the scene**: A scene image has multiple tappable regions
  (from `scene_objects`); a word is played and the kid taps the matching
  region. Multiple words can be asked in sequence within one scene.
- **Memory match**: A grid of face-down cards tied to the level's
  vocabulary; flipping two cards reveals image/audio, and matches stay
  revealed.

## Reward System

Stars earned from completing rounds accumulate per kid. Stars unlock the
next level (via `unlock_threshold`) and can be spent on catalog items in
`reward_items` (cosmetics, pets, emojis, animations), which are added to
`kid_inventory` and can be equipped. Because the reward catalog is
data-driven, new reward types can be introduced by inserting catalog
rows and uploading assets, without code changes to the reward system
itself.

## Content Pipeline

1. Vocabulary and scene data is maintained as structured source data
   (e.g. JSON/CSV) in the repository: word, category, level, jyutping,
   English gloss, and image reference.
2. An offline script generates TTS audio per word using a Cantonese-
   capable TTS API, uploads audio and images to Supabase Storage, and
   upserts rows into `vocab_items`, `scenes`, and `level_vocab`.
3. The script is idempotent and rerunnable — new words can be added, and
   individual TTS clips can later be replaced with real human recordings
   by swapping the audio file and rerunning.
4. A content sanity check (run in CI before deploy) verifies every
   `vocab_item` referenced by a level has a working `audio_url` and
   `image_url`, so broken content entries don't ship silently.

## Error Handling & Edge Cases

- **Asset load failures**: Friendly retry UI rather than a dead-end,
  since a young child can't read or act on a technical error message.
- **Duplicate username at signup**: Checked client-side and re-checked
  server-side; shown with a visual/color cue as much as text.
- **Offline/slow connection**: Current level's assets are cached after
  first load so a brief network hiccup doesn't interrupt an in-progress
  game.
- **Progress write conflicts**: Last-write-wins on `progress` is
  acceptable at this scale (e.g. same kid playing on two devices
  simultaneously); no merge logic needed.
- **PIN brute-force**: Mitigated by login rate-limiting.
- **Inappropriate usernames**: Blocked via a basic profanity/blocklist
  filter at signup, since usernames could become visible in future
  social/leaderboard features.

## Testing Strategy

- **Unit tests** (Vitest/Jest): PIN hashing/verification, star/level
  unlock calculations, reward equip logic, profanity filter.
- **API route tests**: Login, signup, progress-save, and reward-unlock
  endpoints against a test Supabase/Postgres instance.
- **Component/integration tests** (React Testing Library): Game
  components — correct taps advance the round, incorrect taps retry
  without a failure state.
- **Manual device testing**: Automated tests can't validate tap-target
  sizing, audio timing feel, or real usability for a 3-6 year old — real
  device walkthroughs (ideally with an actual child in range) are
  required before significant releases.
- **Content pipeline sanity check**: Verifies all referenced vocab items
  have working audio/image URLs before deploy.

## Deployment / CI

- GitHub repository, `main` as the production branch.
- Vercel connected to the repo: automatic production deploy on every
  merge to `main`; automatic preview deploys on branches/PRs.
- GitHub Actions run lint, unit/API/component tests, and the content
  sanity check as required PR checks.
- Secrets (Supabase URL/keys) stored as Vercel environment variables and
  GitHub Actions secrets, never committed to the repository.
- Database migrations managed via Supabase CLI migration files committed
  to the repo, applied manually given the small scale of this project.
