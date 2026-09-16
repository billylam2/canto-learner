# Canto Visual Styling Design

## Purpose

Canto (Plans 1 through 4b) is fully functional and live, but has zero visual styling — every page renders as unstyled default HTML (black serif text on a white background, no layout, no color). This spec covers restyling the entire existing app with a cohesive, kid-friendly visual identity, as a pure presentation-layer change with no routing, data-fetching, or game-logic changes. It is the first of two follow-up design cycles (the second being a rewards/gamification system, designed separately afterward); reward UI will be built on top of the component system this spec establishes.

## Decisions

- **Styling technology:** Tailwind CSS, added fresh to the project (currently has no CSS infrastructure at all — no Tailwind, no CSS Modules, no `globals.css`).
- **Visual direction:** "Playful Match" — the styling mirrors the existing AI-generated vocab/scene art style (`cute flat cartoon illustration, thick black outlines, solid bright colors`), rather than introducing a distinct pastel, minimal, or storybook look. Chosen after comparing 4 mocked-up directions in a visual brainstorming session.
- **Scope:** every existing page gets restyled in this one pass — login, signup, the guest/authenticated home views, the level-select page, the Listen & Tap game, and the Find-in-Scene game. Nothing is left in its current unstyled state.
- **Devices:** fully responsive — phone, tablet, and desktop, since the target audience (kids aged 3-6, via a parent's device) could be using any of the three.
- **Branding:** a persistent branded header (the "Canto" wordmark) appears on every page, with a "← Levels" back-link shown when inside a game or level page.

## Foundation

**Color palette:**

| Role | Color | Hex |
|---|---|---|
| Primary (CTAs, header) | Coral red | `#FF5A5F` |
| Secondary (secondary actions/links) | Sky blue | `#4DABF7` |
| Stars / highlights | Sunny yellow | `#FFC93C` |
| Success (correct answer feedback) | Green | `#51CF66` |
| Page background | Warm cream | `#FFF8E7` |
| Text / outlines | Near-black | `#1A1A1A` |
| Card surfaces | White | `#FFFFFF` |

**Typography:** a single Google Font, **Baloo 2**, loaded via `next/font/google`. Headings use a heavier weight (700-800), body text a lighter weight (500-600) of the same family — no font pairing, to keep the type system simple.

**Signature "sticker" style:** every card and button carries a 3-4px solid `#1A1A1A` border plus a flat, unblurred offset drop-shadow (`4px 4px 0 #1A1A1A`), with generous corner radius (16-20px on cards, 12-14px on buttons). This is the single most identifying visual trait carried across every component, directly echoing the thick-outline cartoon art style already used for vocab icons and scenes.

## Shared components

All five are plain presentational components — no data fetching, no game logic — introduced under `src/components/ui/` so they're reusable for the upcoming rewards work as well as the existing pages.

- **`Header`** — coral-red bar with the "Canto" wordmark (Baloo 2, white, bold). Shows a "← Levels" link back to `/play` when rendered from inside a game or level-detail page; otherwise just the wordmark.
- **`Card`** — the white, bordered, shadowed container described under Foundation. Used for: each row in the level list, the login/signup form, and the frame around each game's content.
- **`Button`** — the chunky bordered button. Two variants:
  - `primary` — coral fill, white text. Used for main actions: "Play!", "Log in", "Create account", "Play again".
  - `secondary` — white fill, colored border matching context. Used for less-prominent actions: the "Listen & Tap" / "Find in the Scene" game links, "Back to levels".
  - Both variants have a pressed state (shifts down 2px, shadow shrinks to match) for tactile tap feedback.
- **`StarRating`** — a single yellow bordered star icon plus a bold numeral, e.g. "⭐ 24 stars". Deliberately not a literal row of N star glyphs, since per-level totals range up to 30 and a literal row wouldn't read well at that count.
- **`LockedLevelCard`** — a muted/grayscale `Card` variant showing a lock icon and the level name, with no button — visually distinct from a playable level at a glance, replacing the current plain "Level — locked" text.

## Page-by-page treatment

- **`src/app/layout.tsx`** — loads the Baloo 2 font, imports the new Tailwind global stylesheet, sets the cream background on `<body>`.
- **`src/app/home-views.tsx`** (`GuestHome`, `AuthenticatedHome`) — wrapped in `Header` + `Card`; the signup/login links and the logout button become `Button`s.
- **`src/app/login/page.tsx`, `src/app/signup/page.tsx`** — the form is wrapped in a `Card`; inputs get the bordered/rounded input treatment; the submit control becomes a `Button`; the existing error `<p role="alert">` becomes a colored alert banner (still the same role/text, just restyled).
- **`src/app/play/page.tsx`** (level list) — each level becomes either a playable `Card` (with `StarRating` and `Button`-styled game links) or a `LockedLevelCard`, laid out in a responsive grid that stacks to one column on phones and multiple columns on tablet/desktop.
- **`src/app/play/[levelId]/listen-tap-game.tsx`** — wrapped in a `Card`; the three answer-choice images become large bordered square tiles for bigger tap targets; "Round X of Y" becomes a small pill badge; the retry message becomes a colored alert banner (same role/text).
- **`src/app/play/[levelId]/scene/scene-game.tsx`** — wrapped in a `Card`; the scene image gets a rounded border; "Question X of Y" uses the same pill badge as Listen & Tap; "Play again" becomes a `secondary` `Button`; the retry message uses the same banner treatment.
- **`src/app/play/[levelId]/page.tsx`, `src/app/play/[levelId]/scene/page.tsx`** — server components with no markup of their own (they fetch data and delegate to the client components above); no changes needed.
- **`src/app/page.tsx`** — no markup of its own either (delegates to `home-views.tsx`); no changes needed.

## Testing approach

Every existing component's accessible text, ARIA roles, and `data-testid` attributes are preserved exactly — only the surrounding visual presentation changes. This means the current 156 tests are expected to keep passing unmodified, since they assert on text content, roles, and test ids rather than markup structure or CSS classes. The five new shared components each get a small render test (renders expected content; variant props produce the expected element/attributes). The pass finishes with a live manual QA sweep via `claude-in-chrome` across every page, at both a phone-width and a desktop-width viewport.

## Non-goals

- Animations, confetti, or celebration effects on correct answers or level completion — that belongs to the separate rewards/gamification design, to avoid building overlapping UI twice.
- Dark mode.
- Any change to routing, data-fetching, or game logic — this is a presentation-layer-only change.
- A formal accessibility audit (reasonable contrast and visible focus states are maintained, but no full WCAG pass).
