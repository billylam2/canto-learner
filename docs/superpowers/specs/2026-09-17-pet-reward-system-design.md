# Pet Reward System Design

## Problem

Stars are currently earned but never spent — they only gate level unlocking (see the sequential-progression spec) and appear as a per-level `X / maxStars` display. This adds a second use for stars: a shop where kids spend accumulated stars on cosmetic accessories for a companion pet.

## v1 scope

- One fixed pet, one fixed pose.
- Three starter accessories: Bow (★10), Glasses (★15), Party Hat (★20) — easily tunable/expandable content, not an architectural limit.
- No animation. The design still supports adding it later for free: accessories are already independent positioned layers, so a CSS keyframe animation is a pure presentational addition with zero data-model change.
- Multiple accessories can be equipped simultaneously (independent layers, not combo images).
- Both authenticated (Supabase-backed) and guest (localStorage-backed) users get the full feature, mirroring how progress already works for both.

## Currency model

No new "wallet" balance is stored. A kid's spendable balance is derived:

```
lifetimeStars = sum of starsEarned across all of a kid's ProgressRow entries
spent = sum of cost, looked up from the ACCESSORIES catalog, for every accessory the kid owns
balance = lifetimeStars - spent
```

This reuses the existing per-level `starsEarned` (already a lifetime high-water-mark per level — see `saveLevelProgress`/`saveGuestLevelProgress`) with no changes to how stars are earned or recorded. A new small pure function, `computeLifetimeStars(progress: ProgressRow[]): number`, is added alongside `computeLevelStatus` in `src/lib/game/level-status.ts` and reused by both the authenticated and guest paths, and by the purchase-validation logic below.

Purchasing is a one-time, permanent transaction — cost is charged once, ownership never expires. Equipping/unequipping an owned accessory is free and reversible any number of times; it changes `equipped` only and never affects `spent` or the balance.

Total lifetime stars available across all 5 levels today is 117 (39 vocab items × 3 stars, matching the existing per-level max-star display in `level-list.tsx`).

## Content model

New file `content/rewards.ts`, following the same plain-data-module pattern as `content/vocab.ts` and `content/scenes.ts`:

```ts
export interface PetSource {
  slug: string
  name: string
}

export interface AccessorySource {
  slug: string
  name: string
  cost: number
  xPercent: number
  yPercent: number
  widthPercent: number
}

export const PET: PetSource = { slug: 'fox', name: 'Fox' }

export const ACCESSORIES: AccessorySource[] = [
  { slug: 'bow', name: 'Bow', cost: 10, xPercent: ..., yPercent: ..., widthPercent: ... },
  { slug: 'glasses', name: 'Glasses', cost: 15, xPercent: ..., yPercent: ..., widthPercent: ... },
  { slug: 'party-hat', name: 'Party Hat', cost: 20, xPercent: ..., yPercent: ..., widthPercent: ... },
]
```

`xPercent`/`yPercent`/`widthPercent` position each accessory over the pet image, the same percent-rectangle convention already used for `SCENE_OBJECTS` hotspots — authored the same way: generate the image, render a debug overlay, adjust by eye. (Height is derived from the accessory image's own aspect ratio client-side rather than stored, since accessories aren't hit-tested like scene objects — they're purely decorative and don't need a stored `heightPercent`.)

## Image pipeline

Two new asset categories, both requiring new generation tooling:

**Pet base image**: generated like any vocab/scene image — one `generateImage()` call via a new `scripts/generate-pet.ts` (mirrors `generate-one.ts`), saved to `content/images/pets/<pet-slug>.png`. No transparency needed; it's the background layer.

**Accessory images**: need a transparent background so they can sit on top of the pet as independent layers. Gemini's image generation cannot output alpha transparency directly, so:

1. Prompt each accessory in isolation on a solid, distinctive backdrop color unlikely to appear in the accessory itself (e.g. pure green `#00FF00`), explicitly asking for "no shadow, no other objects."
2. Post-process with a new function, `chromaKeyToTransparent(buffer: Buffer, keyColor: {r,g,b}, tolerance: number): Promise<Buffer>` in a new `src/lib/content/image-transparency.ts` (alongside the existing `image-resize.ts`), built on `sharp` (already a dependency): read raw RGBA pixel data, zero the alpha channel for pixels within `tolerance` of `keyColor`, re-encode as PNG.
3. A new script `scripts/generate-accessory.ts` ties this together: generate → chroma-key → save to `content/images/pets/accessories/<accessory-slug>.png`.

**Risk, called out explicitly**: AI-generated "isolated on solid background" images often have soft/anti-aliased edges or slight color bleed near the subject, which can leave a visible fringe after chroma-keying. This will need the same visual-QA-and-iterate loop already used for scene hotspots (regenerate, inspect, adjust tolerance or prompt) rather than a guaranteed one-shot result. The plan should budget for this per accessory, not assume it works first try.

**Sync**: a new `scripts/sync-rewards.ts` (mirrors `sync-content.ts`) uploads `content/images/pets/<slug>.png` to a new `pet-images` Storage bucket and each `content/images/pets/accessories/<slug>.png` to a new `accessory-images` bucket. No database row is needed to track these URLs — Supabase Storage public URLs are deterministic (`${SUPABASE_URL}/storage/v1/object/public/<bucket>/<path>`), so the URL is constructed server-side (where `SUPABASE_URL` is available) in the pet page and passed down as a prop, the same way vocab image URLs ultimately reach the browser as already-resolved strings, just without needing a DB table in this case since the catalog itself is static content, not per-kid data.

## Data model

**New table**, `supabase/migrations/0005_create_kid_accessories.sql`:

```sql
create table kid_accessories (
  kid_id uuid not null references kids(id) on delete cascade,
  accessory_slug text not null,
  equipped boolean not null default true,
  purchased_at timestamptz not null default now(),
  primary key (kid_id, accessory_slug)
);

alter table kid_accessories enable row level security;
```

No new `pets` table — v1 has exactly one static pet, nothing per-kid to store about it.

**New DB access module**, `src/lib/db/accessories.ts` (mirrors `src/lib/db/progress.ts`):

```ts
export interface KidAccessoryRow {
  accessorySlug: string
  equipped: boolean
}

export async function getAccessoriesForKid(supabase: SupabaseClient, kidId: string): Promise<KidAccessoryRow[]>

export async function purchaseAccessory(supabase: SupabaseClient, kidId: string, accessorySlug: string): Promise<void>
// Throws if the kid already owns it, or if their current balance (computed
// via getProgressForKid + computeLifetimeStars, minus the cost of
// currently-owned accessories from the ACCESSORIES catalog) is below the
// accessory's cost. This mirrors saveLevelProgress's shape: validation logic
// lives in this function, not the API route.

export async function setAccessoryEquipped(supabase: SupabaseClient, kidId: string, accessorySlug: string, equipped: boolean): Promise<void>
// Throws if the kid doesn't own the accessory.
```

**New API routes** (mirror `src/app/api/progress/route.ts`'s auth/validation shape):

- `POST /api/accessories/purchase` — body `{ accessorySlug: string }`. 401 if no session, 400 for a bad/missing slug, otherwise calls `purchaseAccessory` and returns `{ ok: true }` (or a 400 with an error message if the DB layer rejects the purchase — insufficient balance or already owned).
- `POST /api/accessories/equip` — body `{ accessorySlug: string, equipped: boolean }`. Same auth/validation shape, calls `setAccessoryEquipped`.

**Guest mirror**, new `src/lib/guest/accessories.ts` (mirrors `src/lib/guest/progress.ts`, localStorage key `canto-guest-accessories`):

```ts
export interface GuestAccessoryRow {
  accessorySlug: string
  equipped: boolean
}

export function getGuestAccessories(): GuestAccessoryRow[]

export function purchaseGuestAccessory(accessorySlug: string): { ok: boolean; accessories: GuestAccessoryRow[] }
// Same balance/ownership validation as purchaseAccessory, computed from
// getGuestProgress() + computeLifetimeStars. ok:false and an unchanged list
// when the purchase is invalid, so the caller can show a message without a
// thrown exception crossing the client/localStorage boundary.

export function setGuestAccessoryEquipped(accessorySlug: string, equipped: boolean): GuestAccessoryRow[]
```

## UI

New route `/pet`, following the `/play` page's server/guest split:

- **`src/app/pet/page.tsx`** (Server Component): no session → render `GuestPetPage`. With a session → fetch progress (`getProgressForKid`) and owned accessories (`getAccessoriesForKid`), compute `lifetimeStars` via `computeLifetimeStars`, resolve the pet and accessory image URLs (server-side, from `SUPABASE_URL`), and render `PetShop` with all of that as props plus `showLogout`.
- **`src/app/guest-pet-page.tsx`** (Client Component): mirrors `guest-play-page.tsx` — reads `getGuestProgress()` and `getGuestAccessories()` in a `useEffect` (same hydration-safety reasoning already documented there), computes the same derived values, renders `PetShop` with `showResetGuestProgress`. Image URLs are still resolved server-side and passed through — the guest page still needs a way to receive them, so `page.tsx` resolves the image URLs regardless of session state and passes them to whichever client component it renders.
- **`src/components/pet-shop.tsx`** (Client Component): the shared shop UI. Renders the pet stage (base image + one absolutely-positioned `<img>` per *equipped* accessory, using its `xPercent`/`yPercent`/`widthPercent`), the current star balance, and a list of all `ACCESSORIES` each showing name, cost, and one of: a disabled "Buy" button (balance too low), an enabled "Buy" button, or an equip/unequip toggle (already owned). Calls the API routes (authenticated) or the guest functions (guest) on interaction — which one it calls is decided by a prop (an `onPurchase`/`onToggleEquip` callback pair passed in by the parent page, exactly like `ListenTapGame`'s `onLevelComplete` prop pattern), not by checking session state itself.

**Navigation**: a link to `/pet` is added to `src/app/play/page.tsx` and `src/app/guest-play-page.tsx` (near the "Choose a level" heading, not the header's utility-link area, which is reserved for Log out/Reset progress).

## Testing plan

- `computeLifetimeStars`: unit tests in `src/lib/game/level-status.test.ts` (sums correctly, empty progress → 0).
- `src/lib/content/image-transparency.test.ts`: unit tests for `chromaKeyToTransparent` against small synthetic test buffers (a solid-color square becomes fully transparent within tolerance; a contrasting pixel stays opaque).
- `src/lib/db/accessories.test.ts`: mirrors `src/lib/db/progress.test.ts`'s Supabase-mock style — purchase succeeds/fails on balance, equip fails when not owned.
- `src/app/api/accessories/purchase/route.test.ts`, `.../equip/route.test.ts`: mirror `src/app/api/progress/route.test.ts` (401 unauthenticated, 400 bad body, happy path).
- `src/lib/guest/accessories.test.ts`: mirrors `src/lib/guest/progress.test.ts`.
- `src/components/pet-shop.test.tsx`: renders owned/unowned/unaffordable states correctly, toggling equip shows/hides the accessory layer, calls the right callback on purchase/equip.
- `src/app/pet/page.test.tsx`, `src/app/guest-pet-page.test.tsx`: mirror the `/play` page tests' session-branching style.

## Out of scope

- Animation (deferred, but the layering design doesn't block adding it later).
- Multiple pets or pet selection.
- True combinatorial "outfit" images — accessories are always independent layers, never pre-composited.
- Any change to how stars are earned or how level progress is saved.
- Avatar accessories for the kid themselves (no base avatar system exists; out of scope per the earlier brainstorming decision).
