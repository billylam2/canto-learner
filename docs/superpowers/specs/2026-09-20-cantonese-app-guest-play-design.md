# Guest Play Design

## Purpose

Currently Canto requires a named kid account (username + 4-digit PIN) before any gameplay — every `/play*` route redirects unauthenticated visitors to `/login`. This spec adds guest play: a kid can start playing immediately, with no account, and by default. This is a standalone feature, independent of the (not-yet-designed) rewards system and separate from the just-completed visual styling work.

## Decisions

- **Persistence:** guest progress (stars, unlocked levels) is stored in `localStorage` only — no server round-trip, no row created in Supabase's `kids`/`progress` tables. Progress persists across reloads on the same browser, but is lost if browser data is cleared or a different device/browser is used. This tradeoff was chosen explicitly over a "real anonymous Supabase account" option for simplicity and privacy.
- **Default landing:** `GuestHome` (shown to visitors with no session) keeps its current guest-home screen, but gains a prominent "Play as guest" action, visually primary over "Create an account" / "Log in".
- **No conversion:** guest progress and named-account progress are two fully independent tracks. Creating a named account always starts fresh; there is no import/merge step for prior guest progress.
- **One URL structure for everyone:** `/play`, `/play/[levelId]`, and `/play/[levelId]/scene` serve both guest and named-account users. The routes branch internally on session presence rather than guests using a separate route namespace.
- **Named-account behavior is unchanged:** every branch of every existing route that currently runs when a session is present keeps running exactly as it does today. All guest-related logic is additive — new files, plus one new conditional branch in each of the three existing gated pages, replacing today's redirect-to-`/login`.

## Architecture

Next.js Server Components can't read `localStorage`, so the existing session-gated pages (currently: fetch DB progress server-side, compute unlock status, redirect if needed) can't make guest unlock decisions server-side. The design branches each gated route on session presence: with a session, the existing server-side logic runs unchanged; without one, the page renders a new Client Component that reads progress from `localStorage`, computes unlock status using the *same* `computeLevelStatus` function already used for named accounts, and either renders the requested content or client-side-redirects back to `/play` — mirroring the server-side redirect behavior for named accounts on a locked level.

## Components

**`src/lib/guest/progress.ts`** — mirrors the shape and semantics of the existing `src/lib/db/progress.ts`, backed by `localStorage` instead of Supabase, reusing the existing `ProgressRow` type so `computeLevelStatus` needs no guest-specific awareness:

```ts
import type { ProgressRow } from '@/lib/db/progress'

export function getGuestProgress(): ProgressRow[]
// Reads and parses localStorage; returns [] if absent, unparseable, or called server-side (no `window`).

export function saveGuestLevelProgress(levelId: number, starsEarned: number, gameType: string): ProgressRow[]
// Same "best stars wins, append gameType if new" semantics as saveLevelProgress, applied in-memory and
// written back to localStorage. Returns the updated array.
```

**`src/components/guest-level-gate.tsx`** (Client Component) — the reusable unlock-check + save-callback provider for a single level's game page:

```tsx
// GuestLevelGate({ levelId: number, gameType: string, children: (onLevelComplete: (stars: number) => void) => ReactNode })
```

On mount, reads `getGuestProgress()`, computes status via `computeLevelStatus(LEVELS, progress)`, and either renders `children` (passing a callback that calls `saveGuestLevelProgress(levelId, stars, gameType)`) when the level is unlocked, or redirects to `/play` via `useRouter().push('/play')` when it isn't.

**`src/components/level-list.tsx`** — extracted, purely presentational rendering of the level list (the `Card`/`LockedLevelCard`/`StarRating`/`LinkButton` wiring introduced in the visual styling work), taking already-computed data:

```tsx
// LevelList({ levels: LevelStatus[] })
```

Used by both the server-rendered named-account path and the new client-rendered guest path, so the markup exists in exactly one place regardless of where the underlying progress came from.

**`src/app/guest-play-page.tsx`** (Client Component, new) — the guest counterpart to the server-rendered level list: computes `levels` from `getGuestProgress()` on mount and renders `<LevelList levels={levels} />`.

## Routing changes

Each of the three existing gated routes gets exactly one new branch; their existing (session-present) branch is untouched:

- **`src/app/play/page.tsx`**: when there is no session, render `<GuestPlayPage />` instead of `redirect('/login')`.
- **`src/app/play/[levelId]/page.tsx`**: when there is no session, still fetch `vocabItems` via `getVocabItemsForLevel` exactly as today (public content, no auth required), then render `<GuestLevelGate levelId={levelId} gameType="listen-tap">{(onLevelComplete) => <ListenTapGame levelId={levelId} levelName={level.name} vocabItems={vocabItems} onLevelComplete={onLevelComplete} />}</GuestLevelGate>` instead of `redirect('/login')`.
- **`src/app/play/[levelId]/scene/page.tsx`**: the same pattern, fetching `scenes` via `getScenesForLevel` and gating with `gameType="find-scene"`.

## Game component changes

`ListenTapGame` and `SceneGame` (`src/app/play/[levelId]/listen-tap-game.tsx`, `src/app/play/[levelId]/scene/scene-game.tsx`) each gain one new optional prop:

```tsx
onLevelComplete?: (starsEarned: number) => Promise<void> | void
```

`finishLevel` calls `onLevelComplete` when provided; otherwise it falls back to today's behavior (`POST /api/progress`). Named-account callers pass nothing, so their behavior — and every existing test for these components — is unchanged. Only `GuestLevelGate` supplies the `localStorage`-writing callback.

## `GuestHome` changes

`src/app/home-views.tsx`'s `GuestHome` gains one new element: a visually primary `LinkButton` to `/play` labeled "Play as guest". Since `/play` already handles the no-session case per the routing changes above, this button needs no logic of its own beyond navigation. "Create an account" / "Log in" become the secondary actions.

## Testing approach

`src/lib/guest/progress.ts` gets direct unit tests (jsdom provides a real `localStorage`; tests clear it between runs) covering the same best-stars/append-gameType semantics as the existing `saveLevelProgress` tests. `GuestLevelGate` gets tests mocking `next/navigation`'s router and seeding `localStorage` directly, covering both the unlocked (renders children, callback writes correctly) and locked (redirects to `/play`) cases. `GuestPlayPage` and the extracted `LevelList` get render tests. `GuestHome`'s existing test file gets one new assertion for the "Play as guest" link. Every existing test for `ListenTapGame`, `SceneGame`, and the three session-gated pages is expected to keep passing completely unmodified, since the named-account code path isn't touched and the new prop is optional. The pass finishes with a live `claude-in-chrome` sweep: a fresh (no-cookie) visit shows "Play as guest" prominently on `GuestHome`; playing a level as a guest and refreshing confirms progress persisted; visiting a locked level's URL directly bounces back to `/play`; and the named-account signup/login/play flow is re-confirmed to work exactly as before.

## Non-goals

- No guest-to-named-account progress conversion.
- No cross-device/cross-browser guest progress — `localStorage` is inherently per-browser, and that's an accepted tradeoff of this design.
- No server-side guest analytics or tracking.
- No interaction with the (not-yet-designed) reward system beyond it applying to guests the same way it applies to named accounts once it exists — nothing guest-specific to build there now.
