# Pet Reward System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let kids spend accumulated stars on cosmetic accessories for a companion pet, with multiple accessories equippable at once.

**Architecture:** A derived currency (`lifetimeStars - spent`, no new wallet field) backs a shop. Accessories are independent, percent-positioned image layers over a fixed-pose pet — no live compositing, no animation in v1. Authenticated purchases go through a new Supabase table + API routes; guests get a mirrored localStorage module, exactly like the existing progress system.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase, `sharp` for image post-processing.

**Spec:** `docs/superpowers/specs/2026-09-17-pet-reward-system-design.md`

## Global Constraints

- Purchasing is one-time and permanent; equip/unequip is free and reversible and never touches the balance.
- No new "wallet" balance field — the balance is always derived from existing `ProgressRow.starsEarned` data plus the accessory catalog's costs.
- No animation in v1, but nothing in the layering design should need to change to add it later.
- Every task must leave `npm test`, `npm run lint`, and `npm run build` green before its commit.

---

### Task 1: `computeLifetimeStars`

**Files:**
- Modify: `src/lib/game/level-status.ts`
- Modify: `src/lib/game/level-status.test.ts`

**Interfaces:**
- Consumes: `ProgressRow` from `src/lib/db/progress.ts` (`{ levelId: number; starsEarned: number; completedGameTypes: string[] }`).
- Produces: `computeLifetimeStars(progress: ProgressRow[]): number`, exported alongside `computeLevelStatus`. Tasks 4 and 6 import and use this directly.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/lib/game/level-status.test.ts`:

```ts
describe('computeLifetimeStars', () => {
  it('sums stars earned across all levels', () => {
    const progress = [
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
      { levelId: 2, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ]
    expect(computeLifetimeStars(progress)).toBe(34)
  })

  it('returns 0 for empty progress', () => {
    expect(computeLifetimeStars([])).toBe(0)
  })
})
```

Update the top import line to add the new function:

```ts
import { computeLevelStatus, computeLifetimeStars } from './level-status'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- level-status.test.ts`
Expected: FAIL — `computeLifetimeStars` is not exported yet.

- [ ] **Step 3: Add the function**

Append to `src/lib/game/level-status.ts`:

```ts
export function computeLifetimeStars(progress: ProgressRow[]): number {
  return progress.reduce((sum, row) => sum + row.starsEarned, 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- level-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/level-status.ts src/lib/game/level-status.test.ts
git commit -m "feat: add computeLifetimeStars for the pet reward system"
```

---

### Task 2: Reward content catalog

**Files:**
- Create: `content/rewards.ts`
- Create: `content/rewards.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `PetSource`, `AccessorySource`, `PET: PetSource`, `ACCESSORIES: AccessorySource[]`. Tasks 4, 6, 7, 8, and 9 import `PET`/`ACCESSORIES` from `../../content/rewards` (path depth varies by file location, same convention as `content/vocab.ts` imports elsewhere in the app).

- [ ] **Step 1: Write the failing test**

Create `content/rewards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PET, ACCESSORIES } from './rewards'

describe('reward content', () => {
  it('has a pet with a non-empty slug and name', () => {
    expect(PET.slug.length).toBeGreaterThan(0)
    expect(PET.name.length).toBeGreaterThan(0)
  })

  it('has a unique slug for every accessory', () => {
    const slugs = ACCESSORIES.map((accessory) => accessory.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('gives every accessory a positive cost and a valid position rectangle', () => {
    for (const accessory of ACCESSORIES) {
      expect(accessory.cost).toBeGreaterThan(0)
      expect(accessory.xPercent).toBeGreaterThanOrEqual(0)
      expect(accessory.yPercent).toBeGreaterThanOrEqual(0)
      expect(accessory.xPercent + accessory.widthPercent).toBeLessThanOrEqual(100)
    }
  })

  it('has at least 3 starter accessories', () => {
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rewards.test.ts`
Expected: FAIL — `content/rewards.ts` does not exist yet.

- [ ] **Step 3: Create the content file**

Create `content/rewards.ts`. The `xPercent`/`yPercent`/`widthPercent` values below are a reasonable starting guess for a roughly-centered pet in a fixed pose — like `SCENE_OBJECTS` in `content/scenes.ts`, they get refined in Task 10 by generating the real images and visually inspecting them with `render-pet-debug.ts` (added in Task 9); they cannot be known precisely before the raster images exist.

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
  { slug: 'bow', name: 'Bow', cost: 10, xPercent: 58, yPercent: 15, widthPercent: 18 },
  { slug: 'glasses', name: 'Glasses', cost: 15, xPercent: 30, yPercent: 38, widthPercent: 40 },
  { slug: 'party-hat', name: 'Party Hat', cost: 20, xPercent: 30, yPercent: 2, widthPercent: 42 },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rewards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/rewards.ts content/rewards.test.ts
git commit -m "feat: add pet and accessory reward content catalog"
```

---

### Task 3: `chromaKeyToTransparent`

**Files:**
- Create: `src/lib/content/image-transparency.ts`
- Create: `src/lib/content/image-transparency.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `RgbColor` (`{ r: number; g: number; b: number }`) and `chromaKeyToTransparent(buffer: Buffer, keyColor: RgbColor, tolerance?: number): Promise<Buffer>`. Task 9's `generate-accessory.ts` script imports this.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/content/image-transparency.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { chromaKeyToTransparent } from './image-transparency'

describe('chromaKeyToTransparent', () => {
  it('makes pixels matching the key color fully transparent', async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer()

    const output = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 })
    const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

    expect(info.channels).toBe(4)
    expect(data[3]).toBe(0)
  })

  it('keeps pixels outside the tolerance fully opaque', async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer()

    const output = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 })
    const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

    expect(data[3]).toBe(255)
  })

  it('respects a custom tolerance', async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 20, g: 235, b: 20 } },
    })
      .png()
      .toBuffer()

    const strict = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 }, 5)
    const strictPixel = await sharp(strict).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(strictPixel.data[3]).toBe(255)

    const loose = await chromaKeyToTransparent(input, { r: 0, g: 255, b: 0 }, 40)
    const loosePixel = await sharp(loose).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(loosePixel.data[3]).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- image-transparency.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the function**

Create `src/lib/content/image-transparency.ts`:

```ts
import sharp from 'sharp'

export interface RgbColor {
  r: number
  g: number
  b: number
}

export async function chromaKeyToTransparent(buffer: Buffer, keyColor: RgbColor, tolerance = 40): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const distance = Math.sqrt((r - keyColor.r) ** 2 + (g - keyColor.g) ** 2 + (b - keyColor.b) ** 2)
    if (distance <= tolerance) {
      data[i + 3] = 0
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- image-transparency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/image-transparency.ts src/lib/content/image-transparency.test.ts
git commit -m "feat: add chroma-key transparency utility for accessory images"
```

---

### Task 4: `kid_accessories` table and DB access module

**Files:**
- Create: `supabase/migrations/0005_create_kid_accessories.sql`
- Create: `src/lib/db/accessories.ts`
- Create: `src/lib/db/accessories.test.ts`

**Interfaces:**
- Consumes: `getProgressForKid` from `./progress`, `computeLifetimeStars` from `../game/level-status` (Task 1), `ACCESSORIES` from `../../../content/rewards` (Task 2).
- Produces: `KidAccessoryRow` (`{ accessorySlug: string; equipped: boolean }`), `getAccessoriesForKid(supabase, kidId): Promise<KidAccessoryRow[]>`, `purchaseAccessory(supabase, kidId, accessorySlug): Promise<void>` (throws on unknown slug, already-owned, or insufficient balance), `setAccessoryEquipped(supabase, kidId, accessorySlug, equipped): Promise<void>` (throws if not owned). Task 5's API routes call these directly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_create_kid_accessories.sql`:

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

This is a local file only in this plan — no step here runs it against a live database. Task 10 applies it when syncing real content, the same way earlier migrations were already applied to the project's Supabase instance outside of test runs.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/db/accessories.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccessoriesForKid, purchaseAccessory, setAccessoryEquipped } from './accessories'
import { getProgressForKid } from './progress'

vi.mock('./progress', () => ({
  getProgressForKid: vi.fn(),
}))

function makeSupabaseMock(overrides: {
  listResult?: { data: unknown; error: unknown }
  insertResult?: { error: unknown }
  updateResult?: { error: unknown }
}) {
  const selectChain = {
    eq: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve(overrides.listResult ?? { data: [], error: null }),
  }
  selectChain.eq.mockReturnValue(selectChain)
  const select = vi.fn().mockReturnValue(selectChain)

  const updateChain = {
    eq: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve(overrides.updateResult ?? { error: null }),
  }
  updateChain.eq.mockReturnValue(updateChain)
  const update = vi.fn().mockReturnValue(updateChain)

  const insert = vi.fn().mockResolvedValue(overrides.insertResult ?? { error: null })

  const from = vi.fn().mockReturnValue({ select, insert, update })
  const supabase = { from } as unknown as SupabaseClient
  return { supabase, insert, update }
}

describe('getAccessoriesForKid', () => {
  it('returns mapped accessory rows', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
    })
    const result = await getAccessoriesForKid(supabase, 'kid-1')
    expect(result).toEqual([{ accessorySlug: 'bow', equipped: true }])
  })

  it('throws when the query errors', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: null, error: { message: 'boom' } } })
    await expect(getAccessoriesForKid(supabase, 'kid-1')).rejects.toThrow(
      'Failed to fetch accessories for kid kid-1: boom'
    )
  })
})

describe('purchaseAccessory', () => {
  beforeEach(() => {
    vi.mocked(getProgressForKid).mockReset()
  })

  it('inserts a new row when the kid can afford it', async () => {
    const { supabase, insert } = makeSupabaseMock({ listResult: { data: [], error: null } })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await purchaseAccessory(supabase, 'kid-1', 'bow')

    expect(insert).toHaveBeenCalledWith({ kid_id: 'kid-1', accessory_slug: 'bow', equipped: true })
  })

  it('throws when the kid already owns the accessory', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
    })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow('already owns')
  })

  it('throws when the kid cannot afford the accessory', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: [], error: null } })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 2, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow('cannot afford')
  })

  it('subtracts the cost of already-owned accessories from the available balance', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'party-hat', equipped: true }], error: null },
    })
    // party-hat costs 20; with 24 lifetime stars only 4 remain, not enough for bow (10)
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow('cannot afford')
  })

  it('throws when the accessory slug is unknown', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: [], error: null } })
    await expect(purchaseAccessory(supabase, 'kid-1', 'not-a-real-slug')).rejects.toThrow('Unknown accessory')
  })

  it('throws when the insert fails', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [], error: null },
      insertResult: { error: { message: 'boom' } },
    })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])

    await expect(purchaseAccessory(supabase, 'kid-1', 'bow')).rejects.toThrow(
      'Failed to purchase accessory bow: boom'
    )
  })
})

describe('setAccessoryEquipped', () => {
  it('updates the equipped flag when the kid owns the accessory', async () => {
    const { supabase, update } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
    })

    await setAccessoryEquipped(supabase, 'kid-1', 'bow', false)

    expect(update).toHaveBeenCalledWith({ equipped: false })
  })

  it('throws when the kid does not own the accessory', async () => {
    const { supabase } = makeSupabaseMock({ listResult: { data: [], error: null } })
    await expect(setAccessoryEquipped(supabase, 'kid-1', 'bow', false)).rejects.toThrow('does not own')
  })

  it('throws when the update fails', async () => {
    const { supabase } = makeSupabaseMock({
      listResult: { data: [{ accessory_slug: 'bow', equipped: true }], error: null },
      updateResult: { error: { message: 'boom' } },
    })
    await expect(setAccessoryEquipped(supabase, 'kid-1', 'bow', false)).rejects.toThrow(
      'Failed to update accessory bow: boom'
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/lib/db/accessories.test.ts`
Expected: FAIL — `src/lib/db/accessories.ts` does not exist yet.

- [ ] **Step 4: Implement the module**

Create `src/lib/db/accessories.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getProgressForKid } from './progress'
import { computeLifetimeStars } from '../game/level-status'
import { ACCESSORIES } from '../../../content/rewards'

export interface KidAccessoryRow {
  accessorySlug: string
  equipped: boolean
}

export async function getAccessoriesForKid(supabase: SupabaseClient, kidId: string): Promise<KidAccessoryRow[]> {
  const { data, error } = await supabase.from('kid_accessories').select('accessory_slug, equipped').eq('kid_id', kidId)

  if (error) {
    throw new Error(`Failed to fetch accessories for kid ${kidId}: ${error.message}`)
  }

  return (data ?? []).map((row: { accessory_slug: string; equipped: boolean }) => ({
    accessorySlug: row.accessory_slug,
    equipped: row.equipped,
  }))
}

export async function purchaseAccessory(supabase: SupabaseClient, kidId: string, accessorySlug: string): Promise<void> {
  const accessory = ACCESSORIES.find((candidate) => candidate.slug === accessorySlug)
  if (!accessory) {
    throw new Error(`Unknown accessory: ${accessorySlug}`)
  }

  const owned = await getAccessoriesForKid(supabase, kidId)
  if (owned.some((row) => row.accessorySlug === accessorySlug)) {
    throw new Error(`Kid ${kidId} already owns ${accessorySlug}`)
  }

  const progress = await getProgressForKid(supabase, kidId)
  const lifetimeStars = computeLifetimeStars(progress)
  const spent = owned.reduce((sum, row) => {
    const ownedAccessory = ACCESSORIES.find((candidate) => candidate.slug === row.accessorySlug)
    return sum + (ownedAccessory?.cost ?? 0)
  }, 0)
  const balance = lifetimeStars - spent

  if (balance < accessory.cost) {
    throw new Error(`Kid ${kidId} cannot afford ${accessorySlug}: balance ${balance}, cost ${accessory.cost}`)
  }

  const { error } = await supabase
    .from('kid_accessories')
    .insert({ kid_id: kidId, accessory_slug: accessorySlug, equipped: true })

  if (error) {
    throw new Error(`Failed to purchase accessory ${accessorySlug}: ${error.message}`)
  }
}

export async function setAccessoryEquipped(
  supabase: SupabaseClient,
  kidId: string,
  accessorySlug: string,
  equipped: boolean
): Promise<void> {
  const owned = await getAccessoriesForKid(supabase, kidId)
  if (!owned.some((row) => row.accessorySlug === accessorySlug)) {
    throw new Error(`Kid ${kidId} does not own ${accessorySlug}`)
  }

  const { error } = await supabase
    .from('kid_accessories')
    .update({ equipped })
    .eq('kid_id', kidId)
    .eq('accessory_slug', accessorySlug)

  if (error) {
    throw new Error(`Failed to update accessory ${accessorySlug}: ${error.message}`)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/lib/db/accessories.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_create_kid_accessories.sql src/lib/db/accessories.ts src/lib/db/accessories.test.ts
git commit -m "feat: add kid_accessories table and DB access module"
```

---

### Task 5: Purchase and equip API routes

**Files:**
- Create: `src/app/api/accessories/purchase/route.ts`
- Create: `src/app/api/accessories/purchase/route.test.ts`
- Create: `src/app/api/accessories/equip/route.ts`
- Create: `src/app/api/accessories/equip/route.test.ts`

**Interfaces:**
- Consumes: `readSession` from `@/lib/auth/session`, `createSupabaseServerClient` from `@/lib/supabase/client`, `purchaseAccessory`/`setAccessoryEquipped` from `@/lib/db/accessories` (Task 4).
- Produces: `POST /api/accessories/purchase` (body `{ accessorySlug: string }`) and `POST /api/accessories/equip` (body `{ accessorySlug: string; equipped: boolean }`), both returning `{ ok: true }` on success. Task 7's `pet-shop.tsx` calls these by default when no override callback is given.

- [ ] **Step 1: Write the failing tests for the purchase route**

Create `src/app/api/accessories/purchase/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSessionCookieValue, COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/accessories', () => ({
  purchaseAccessory: vi.fn(),
}))

import { POST } from './route'
import { purchaseAccessory } from '@/lib/db/accessories'

async function makeAuthenticatedRequest(body: unknown) {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
  return new NextRequest('http://localhost/api/accessories/purchase', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${cookieValue}`,
    },
  })
}

describe('POST /api/accessories/purchase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('purchases the accessory for the authenticated kid', async () => {
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(purchaseAccessory).toHaveBeenCalledWith(expect.anything(), 'kid-1', 'bow')
  })

  it('rejects an unauthenticated request', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const request = new NextRequest('http://localhost/api/accessories/purchase', {
      method: 'POST',
      body: JSON.stringify({ accessorySlug: 'bow' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('rejects a request missing accessorySlug', async () => {
    const request = await makeAuthenticatedRequest({})
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 400 when the purchase is rejected', async () => {
    vi.mocked(purchaseAccessory).mockRejectedValue(new Error('cannot afford'))
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow' })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/api/accessories/purchase/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Implement the purchase route**

Create `src/app/api/accessories/purchase/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { readSession } from '@/lib/auth/session'
import { purchaseAccessory } from '@/lib/db/accessories'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const accessorySlug = typeof body?.accessorySlug === 'string' ? body.accessorySlug : null

  if (!accessorySlug) {
    return NextResponse.json({ error: 'accessorySlug is required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  try {
    await purchaseAccessory(supabase, session.kidId, accessorySlug)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/api/accessories/purchase/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the equip route**

Create `src/app/api/accessories/equip/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSessionCookieValue, COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/accessories', () => ({
  setAccessoryEquipped: vi.fn(),
}))

import { POST } from './route'
import { setAccessoryEquipped } from '@/lib/db/accessories'

async function makeAuthenticatedRequest(body: unknown) {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
  return new NextRequest('http://localhost/api/accessories/equip', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${cookieValue}`,
    },
  })
}

describe('POST /api/accessories/equip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates equip state for the authenticated kid', async () => {
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow', equipped: false })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(setAccessoryEquipped).toHaveBeenCalledWith(expect.anything(), 'kid-1', 'bow', false)
  })

  it('rejects an unauthenticated request', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const request = new NextRequest('http://localhost/api/accessories/equip', {
      method: 'POST',
      body: JSON.stringify({ accessorySlug: 'bow', equipped: false }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('rejects a request missing required fields', async () => {
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow' })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 400 when the update is rejected', async () => {
    vi.mocked(setAccessoryEquipped).mockRejectedValue(new Error('does not own'))
    const request = await makeAuthenticatedRequest({ accessorySlug: 'bow', equipped: true })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- src/app/api/accessories/equip/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 7: Implement the equip route**

Create `src/app/api/accessories/equip/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { readSession } from '@/lib/auth/session'
import { setAccessoryEquipped } from '@/lib/db/accessories'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const accessorySlug = typeof body?.accessorySlug === 'string' ? body.accessorySlug : null
  const equipped = typeof body?.equipped === 'boolean' ? body.equipped : null

  if (!accessorySlug || equipped === null) {
    return NextResponse.json({ error: 'accessorySlug and equipped are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  try {
    await setAccessoryEquipped(supabase, session.kidId, accessorySlug, equipped)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- src/app/api/accessories/equip/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/accessories
git commit -m "feat: add accessory purchase and equip API routes"
```

---

### Task 6: Guest accessories mirror, and wire it into Reset progress

**Files:**
- Create: `src/lib/guest/accessories.ts`
- Create: `src/lib/guest/accessories.test.ts`
- Modify: `src/components/ui/header.tsx`
- Modify: `src/components/ui/header.test.tsx`

**Interfaces:**
- Consumes: `getGuestProgress` from `./progress`, `computeLifetimeStars` from `@/lib/game/level-status` (Task 1), `ACCESSORIES` from `../../../content/rewards` (Task 2).
- Produces: `GuestAccessoryRow` (`{ accessorySlug: string; equipped: boolean }`), `getGuestAccessories(): GuestAccessoryRow[]`, `purchaseGuestAccessory(accessorySlug): { ok: boolean; accessories: GuestAccessoryRow[] }`, `setGuestAccessoryEquipped(accessorySlug, equipped): GuestAccessoryRow[]`, `clearGuestAccessories(): void`. Task 8's `guest-pet-page.tsx` uses the first three; the Header's existing reset flow uses the fourth.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/guest/accessories.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getGuestAccessories, purchaseGuestAccessory, setGuestAccessoryEquipped, clearGuestAccessories } from './accessories'
import { saveGuestLevelProgress } from './progress'

describe('getGuestAccessories', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns an empty array when nothing is stored', () => {
    expect(getGuestAccessories()).toEqual([])
  })

  it('returns an empty array for unparseable stored data', () => {
    window.localStorage.setItem('canto-guest-accessories', 'not json')
    expect(getGuestAccessories()).toEqual([])
  })
})

describe('purchaseGuestAccessory', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('purchases when the guest can afford it', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    const result = purchaseGuestAccessory('bow')
    expect(result.ok).toBe(true)
    expect(result.accessories).toEqual([{ accessorySlug: 'bow', equipped: true }])
  })

  it('fails when the guest cannot afford it', () => {
    saveGuestLevelProgress(1, 2, 'listen-tap')
    const result = purchaseGuestAccessory('bow')
    expect(result.ok).toBe(false)
    expect(result.accessories).toEqual([])
  })

  it('fails when the guest already owns the accessory', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    const result = purchaseGuestAccessory('bow')
    expect(result.ok).toBe(false)
  })

  it('fails for an unknown accessory slug', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    const result = purchaseGuestAccessory('not-a-real-slug')
    expect(result.ok).toBe(false)
  })

  it('persists across calls to getGuestAccessories', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    expect(getGuestAccessories()).toEqual([{ accessorySlug: 'bow', equipped: true }])
  })
})

describe('setGuestAccessoryEquipped', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('toggles the equipped flag for an owned accessory', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    const result = setGuestAccessoryEquipped('bow', false)
    expect(result).toEqual([{ accessorySlug: 'bow', equipped: false }])
  })
})

describe('clearGuestAccessories', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('removes previously purchased accessories', () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    purchaseGuestAccessory('bow')
    clearGuestAccessories()
    expect(getGuestAccessories()).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/guest/accessories.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the module**

Create `src/lib/guest/accessories.ts`:

```ts
import { getGuestProgress } from './progress'
import { computeLifetimeStars } from '@/lib/game/level-status'
import { ACCESSORIES } from '../../../content/rewards'

const STORAGE_KEY = 'canto-guest-accessories'

export interface GuestAccessoryRow {
  accessorySlug: string
  equipped: boolean
}

export function getGuestAccessories(): GuestAccessoryRow[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function purchaseGuestAccessory(accessorySlug: string): { ok: boolean; accessories: GuestAccessoryRow[] } {
  const owned = getGuestAccessories()

  const accessory = ACCESSORIES.find((candidate) => candidate.slug === accessorySlug)
  if (!accessory || owned.some((row) => row.accessorySlug === accessorySlug)) {
    return { ok: false, accessories: owned }
  }

  const lifetimeStars = computeLifetimeStars(getGuestProgress())
  const spent = owned.reduce((sum, row) => {
    const ownedAccessory = ACCESSORIES.find((candidate) => candidate.slug === row.accessorySlug)
    return sum + (ownedAccessory?.cost ?? 0)
  }, 0)
  const balance = lifetimeStars - spent

  if (balance < accessory.cost) {
    return { ok: false, accessories: owned }
  }

  const updated = [...owned, { accessorySlug, equipped: true }]
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  return { ok: true, accessories: updated }
}

export function setGuestAccessoryEquipped(accessorySlug: string, equipped: boolean): GuestAccessoryRow[] {
  const owned = getGuestAccessories()
  const updated = owned.map((row) => (row.accessorySlug === accessorySlug ? { ...row, equipped } : row))

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  return updated
}

export function clearGuestAccessories(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/guest/accessories.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for Header's reset behavior**

In `src/components/ui/header.test.tsx`, add a hoisted mock for the new module next to the existing `clearGuestProgressMock`:

```ts
const clearGuestAccessoriesMock = vi.hoisted(() => vi.fn())
```

Add a matching `vi.mock` call next to the existing `@/lib/guest/progress` mock:

```ts
vi.mock('@/lib/guest/accessories', () => ({
  clearGuestAccessories: clearGuestAccessoriesMock,
}))
```

Add `clearGuestAccessoriesMock.mockClear()` to the existing `beforeEach`, alongside `clearGuestProgressMock.mockClear()`.

Update the existing `'resets guest progress and navigates to the main page when showResetGuestProgress is true'` test to also assert:

```ts
expect(clearGuestAccessoriesMock).toHaveBeenCalled()
```

(added right after the existing `expect(clearGuestProgressMock).toHaveBeenCalled()` line).

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- header.test.tsx`
Expected: FAIL — `clearGuestAccessories` isn't called by `Header` yet.

- [ ] **Step 7: Update the Header component**

In `src/components/ui/header.tsx`, add the import next to the existing one:

```ts
import { clearGuestProgress } from '@/lib/guest/progress'
import { clearGuestAccessories } from '@/lib/guest/accessories'
```

Update `handleResetGuestProgress`:

```ts
function handleResetGuestProgress() {
  clearGuestProgress()
  clearGuestAccessories()
  router.push('/')
  router.refresh()
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- header.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/guest/accessories.ts src/lib/guest/accessories.test.ts src/components/ui/header.tsx src/components/ui/header.test.tsx
git commit -m "feat: add guest accessories mirror and clear it on progress reset"
```

---

### Task 7: `PetShop` component

**Files:**
- Create: `src/components/pet-shop.tsx`
- Create: `src/components/pet-shop.test.tsx`

**Interfaces:**
- Consumes: `Header`, `Card`, `Button` from `@/components/ui/*` (existing).
- Produces: `ShopAccessory` (`{ slug, name, cost, imageUrl, xPercent, yPercent, widthPercent }`), `OwnedAccessory` (`{ accessorySlug: string; equipped: boolean }`), and the `PetShop` component with props `{ petName, petImageUrl, accessories: ShopAccessory[], initialOwnedAccessories: OwnedAccessory[], lifetimeStars, onPurchase?, onToggleEquip?, showLogout?, showResetGuestProgress? }`. `onPurchase`/`onToggleEquip` default to calling the new API routes (Task 5) directly — the same optional-callback pattern `ListenTapGame` already uses for `onLevelComplete`. Task 8's `pet/page.tsx` renders this with no callbacks (authenticated default path); `guest-pet-page.tsx` overrides both.

- [ ] **Step 1: Write the failing tests**

Create `src/components/pet-shop.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PetShop, type ShopAccessory, type OwnedAccessory } from './pet-shop'

const pushMock = vi.fn()
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

const ACCESSORIES: ShopAccessory[] = [
  { slug: 'bow', name: 'Bow', cost: 10, imageUrl: 'https://example.com/bow.png', xPercent: 60, yPercent: 15, widthPercent: 18 },
  { slug: 'glasses', name: 'Glasses', cost: 15, imageUrl: 'https://example.com/glasses.png', xPercent: 30, yPercent: 38, widthPercent: 40 },
]

describe('PetShop', () => {
  beforeEach(() => {
    pushMock.mockClear()
    refreshMock.mockClear()
  })

  it('shows the pet name and current star balance', () => {
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.getByText('Fox')).toBeInTheDocument()
    expect(screen.getByText('★ 12 stars to spend')).toBeInTheDocument()
  })

  it('shows a disabled Buy button when the balance is below cost', () => {
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={5}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Buy ★ 10' })).toBeDisabled()
  })

  it('purchases an accessory and switches it to an equip toggle', async () => {
    const onPurchase = vi.fn().mockResolvedValue({ ok: true })
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
        onPurchase={onPurchase}
        onToggleEquip={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Buy ★ 10' }))

    expect(onPurchase).toHaveBeenCalledWith('bow')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unequip' })).toBeInTheDocument())
  })

  it('does not change state when the purchase is rejected', async () => {
    const onPurchase = vi.fn().mockResolvedValue({ ok: false })
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
        onPurchase={onPurchase}
        onToggleEquip={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Buy ★ 10' }))

    await waitFor(() => expect(onPurchase).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Buy ★ 10' })).toBeInTheDocument()
  })

  it('shows an equipped accessory image in the stage', () => {
    const owned: OwnedAccessory[] = [{ accessorySlug: 'bow', equipped: true }]
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={owned}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.getByAltText('Bow')).toBeInTheDocument()
  })

  it('hides an unequipped-but-owned accessory image from the stage', () => {
    const owned: OwnedAccessory[] = [{ accessorySlug: 'bow', equipped: false }]
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={owned}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.queryByAltText('Bow')).not.toBeInTheDocument()
  })

  it('toggles equip state and calls onToggleEquip', async () => {
    const onToggleEquip = vi.fn().mockResolvedValue(undefined)
    const owned: OwnedAccessory[] = [{ accessorySlug: 'bow', equipped: true }]
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={owned}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={onToggleEquip}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unequip' }))

    expect(onToggleEquip).toHaveBeenCalledWith('bow', false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Equip' })).toBeInTheDocument())
  })

  it('calls the purchase API by default when no onPurchase is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Buy ★ 10' }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/accessories/purchase',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ accessorySlug: 'bow' }) })
      )
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- pet-shop.test.tsx`
Expected: FAIL — the component doesn't exist yet.

- [ ] **Step 3: Implement the component**

Create `src/components/pet-shop.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface ShopAccessory {
  slug: string
  name: string
  cost: number
  imageUrl: string
  xPercent: number
  yPercent: number
  widthPercent: number
}

export interface OwnedAccessory {
  accessorySlug: string
  equipped: boolean
}

interface PetShopProps {
  petName: string
  petImageUrl: string
  accessories: ShopAccessory[]
  initialOwnedAccessories: OwnedAccessory[]
  lifetimeStars: number
  onPurchase?: (accessorySlug: string) => Promise<{ ok: boolean }>
  onToggleEquip?: (accessorySlug: string, equipped: boolean) => Promise<void>
  showLogout?: boolean
  showResetGuestProgress?: boolean
}

async function defaultPurchase(accessorySlug: string): Promise<{ ok: boolean }> {
  const response = await fetch('/api/accessories/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessorySlug }),
  })
  return { ok: response.ok }
}

async function defaultToggleEquip(accessorySlug: string, equipped: boolean): Promise<void> {
  await fetch('/api/accessories/equip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessorySlug, equipped }),
  })
}

export function PetShop({
  petName,
  petImageUrl,
  accessories,
  initialOwnedAccessories,
  lifetimeStars,
  onPurchase = defaultPurchase,
  onToggleEquip = defaultToggleEquip,
  showLogout = false,
  showResetGuestProgress = false,
}: PetShopProps) {
  const [owned, setOwned] = useState(initialOwnedAccessories)

  const spent = owned.reduce((sum, row) => {
    const accessory = accessories.find((candidate) => candidate.slug === row.accessorySlug)
    return sum + (accessory?.cost ?? 0)
  }, 0)
  const balance = lifetimeStars - spent

  async function handlePurchase(slug: string) {
    const result = await onPurchase(slug)
    if (result.ok) {
      setOwned((current) => [...current, { accessorySlug: slug, equipped: true }])
    }
  }

  async function handleToggleEquip(slug: string, equipped: boolean) {
    await onToggleEquip(slug, equipped)
    setOwned((current) => current.map((row) => (row.accessorySlug === slug ? { ...row, equipped } : row)))
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showBackLink showLogout={showLogout} showResetGuestProgress={showResetGuestProgress} />
      <main className="max-w-2xl mx-auto p-4">
        <Card className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-extrabold text-brand-ink">{petName}</h1>
          <p className="bg-brand-secondary text-white font-bold rounded-full px-4 py-1 inline-block">
            ★ {balance} stars to spend
          </p>

          <div className="relative w-full max-w-xs aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element -- externally-hosted, positioned by percent, not a Next/Image optimization candidate */}
            <img src={petImageUrl} alt={petName} className="absolute inset-0 w-full h-full object-contain" />
            {accessories
              .filter((accessory) => owned.some((row) => row.accessorySlug === accessory.slug && row.equipped))
              .map((accessory) => (
                // eslint-disable-next-line @next/next/no-img-element -- externally-hosted, positioned by percent, not a Next/Image optimization candidate
                <img
                  key={accessory.slug}
                  src={accessory.imageUrl}
                  alt={accessory.name}
                  className="absolute"
                  style={{
                    left: `${accessory.xPercent}%`,
                    top: `${accessory.yPercent}%`,
                    width: `${accessory.widthPercent}%`,
                  }}
                />
              ))}
          </div>

          <ul className="w-full flex flex-col gap-2">
            {accessories.map((accessory) => {
              const ownedRow = owned.find((row) => row.accessorySlug === accessory.slug)
              return (
                <li
                  key={accessory.slug}
                  className="flex items-center justify-between border-4 border-brand-ink rounded-[16px] bg-white p-3"
                >
                  <span className="font-bold text-brand-ink">{accessory.name}</span>
                  {ownedRow ? (
                    <Button variant="secondary" onClick={() => handleToggleEquip(accessory.slug, !ownedRow.equipped)}>
                      {ownedRow.equipped ? 'Unequip' : 'Equip'}
                    </Button>
                  ) : (
                    <Button onClick={() => handlePurchase(accessory.slug)} disabled={balance < accessory.cost}>
                      Buy ★ {accessory.cost}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- pet-shop.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pet-shop.tsx src/components/pet-shop.test.tsx
git commit -m "feat: add PetShop component"
```

---

### Task 8: `/pet` route, guest page, and navigation links

**Files:**
- Create: `src/app/pet/page.tsx`
- Create: `src/app/pet/page.test.tsx`
- Create: `src/app/guest-pet-page.tsx`
- Create: `src/app/guest-pet-page.test.tsx`
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.tsx`
- Modify: `src/app/guest-play-page.tsx`
- Modify: `src/app/guest-play-page.test.tsx`

**Interfaces:**
- Consumes: `PetShop`, `ShopAccessory`, `OwnedAccessory` from `@/components/pet-shop` (Task 7); `getProgressForKid` from `@/lib/db/progress`; `getAccessoriesForKid` from `@/lib/db/accessories` (Task 4); `computeLifetimeStars` from `@/lib/game/level-status` (Task 1); `PET`, `ACCESSORIES` from `../../content/rewards` (Task 2); `getGuestProgress` from `@/lib/guest/progress`; `getGuestAccessories`, `purchaseGuestAccessory`, `setGuestAccessoryEquipped` from `@/lib/guest/accessories` (Task 6).
- Produces: the `/pet` route, reachable from a new link on `/play`.

- [ ] **Step 1: Write the failing tests for the pet page**

Create `src/app/pet/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const getMock = vi.fn()
const getPublicUrlMock = vi.fn((path: string) => ({ data: { publicUrl: `https://example.com/${path}` } }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    storage: { from: () => ({ getPublicUrl: getPublicUrlMock }) },
  })),
}))
vi.mock('@/lib/db/progress', () => ({
  getProgressForKid: vi.fn(),
}))
vi.mock('@/lib/db/accessories', () => ({
  getAccessoriesForKid: vi.fn(),
}))

import PetPage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { getAccessoriesForKid } from '@/lib/db/accessories'
import { createSessionCookieValue } from '@/lib/auth/session'

describe('PetPage', () => {
  it('renders the guest pet page when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    render(await PetPage())
    expect(await screen.findByText('Fox')).toBeInTheDocument()
  })

  it("renders the shop with the signed-in kid's progress", async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 24, completedGameTypes: ['listen-tap'] },
    ])
    vi.mocked(getAccessoriesForKid).mockResolvedValue([])

    render(await PetPage())

    expect(screen.getByText('★ 24 stars to spend')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "src/app/pet/page.test.tsx"`
Expected: FAIL — `src/app/pet/page.tsx` does not exist yet.

- [ ] **Step 3: Create the guest pet page**

Create `src/app/guest-pet-page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getGuestProgress } from '@/lib/guest/progress'
import { getGuestAccessories, purchaseGuestAccessory, setGuestAccessoryEquipped } from '@/lib/guest/accessories'
import { computeLifetimeStars } from '@/lib/game/level-status'
import { PET } from '../../content/rewards'
import { PetShop, type ShopAccessory, type OwnedAccessory } from '@/components/pet-shop'

interface GuestPetPageProps {
  petImageUrl: string
  accessories: ShopAccessory[]
}

export function GuestPetPage({ petImageUrl, accessories }: GuestPetPageProps) {
  const [state, setState] = useState<{ lifetimeStars: number; owned: OwnedAccessory[] } | null>(null)

  useEffect(() => {
    // Reading localStorage can only happen client-side, so this can't be
    // computed during the initial (server-rendered) render without a
    // hydration mismatch — it genuinely needs to run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({
      lifetimeStars: computeLifetimeStars(getGuestProgress()),
      owned: getGuestAccessories(),
    })
  }, [])

  if (!state) {
    return <p>Loading...</p>
  }

  async function handlePurchase(accessorySlug: string) {
    const result = purchaseGuestAccessory(accessorySlug)
    return { ok: result.ok }
  }

  async function handleToggleEquip(accessorySlug: string, equipped: boolean) {
    setGuestAccessoryEquipped(accessorySlug, equipped)
  }

  return (
    <PetShop
      petName={PET.name}
      petImageUrl={petImageUrl}
      accessories={accessories}
      initialOwnedAccessories={state.owned}
      lifetimeStars={state.lifetimeStars}
      onPurchase={handlePurchase}
      onToggleEquip={handleToggleEquip}
      showResetGuestProgress
    />
  )
}
```

- [ ] **Step 4: Create the pet page**

Create `src/app/pet/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { getAccessoriesForKid } from '@/lib/db/accessories'
import { computeLifetimeStars } from '@/lib/game/level-status'
import { PET, ACCESSORIES } from '../../../content/rewards'
import { PetShop } from '@/components/pet-shop'
import { GuestPetPage } from '../guest-pet-page'

function resolveImageUrls(supabase: SupabaseClient) {
  return {
    petImageUrl: supabase.storage.from('pet-images').getPublicUrl(`${PET.slug}.png`).data.publicUrl,
    accessories: ACCESSORIES.map((accessory) => ({
      ...accessory,
      imageUrl: supabase.storage.from('accessory-images').getPublicUrl(`${accessory.slug}.png`).data.publicUrl,
    })),
  }
}

export default async function PetPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)
  const supabase = createSupabaseServerClient()
  const { petImageUrl, accessories } = resolveImageUrls(supabase)

  if (!session) {
    return <GuestPetPage petImageUrl={petImageUrl} accessories={accessories} />
  }

  const [progress, ownedAccessories] = await Promise.all([
    getProgressForKid(supabase, session.kidId),
    getAccessoriesForKid(supabase, session.kidId),
  ])
  const lifetimeStars = computeLifetimeStars(progress)

  return (
    <PetShop
      petName={PET.name}
      petImageUrl={petImageUrl}
      accessories={accessories}
      initialOwnedAccessories={ownedAccessories}
      lifetimeStars={lifetimeStars}
      showLogout
    />
  )
}
```

- [ ] **Step 5: Run the pet page test to verify it passes**

Run: `npm test -- "src/app/pet/page.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Write the failing test for the guest pet page**

Create `src/app/guest-pet-page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { GuestPetPage } from './guest-pet-page'
import { saveGuestLevelProgress } from '@/lib/guest/progress'
import type { ShopAccessory } from '@/components/pet-shop'

const ACCESSORIES: ShopAccessory[] = [
  { slug: 'bow', name: 'Bow', cost: 10, imageUrl: 'https://example.com/bow.png', xPercent: 60, yPercent: 15, widthPercent: 18 },
]

describe('GuestPetPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows the lifetime star balance computed from guest progress', async () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    render(<GuestPetPage petImageUrl="https://example.com/fox.png" accessories={ACCESSORIES} />)
    await waitFor(() => expect(screen.getByText('★ 24 stars to spend')).toBeInTheDocument())
  })
})
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- guest-pet-page.test.tsx`
Expected: PASS (the guest page was already implemented in Step 3).

- [ ] **Step 8: Add the nav link to `src/app/play/page.tsx`**

Change:

```tsx
import { Header } from '@/components/ui/header'
import { LevelList } from '@/components/level-list'
```

to:

```tsx
import { Header } from '@/components/ui/header'
import { LinkButton } from '@/components/ui/button'
import { LevelList } from '@/components/level-list'
```

Change:

```tsx
      <main className="max-w-3xl lg:max-w-5xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        <LevelList levels={levels} />
      </main>
```

to:

```tsx
      <main className="max-w-3xl lg:max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h1 className="text-3xl font-extrabold text-brand-ink">Choose a level</h1>
          <LinkButton href="/pet" variant="secondary">
            🐾 My Pet
          </LinkButton>
        </div>
        <LevelList levels={levels} />
      </main>
```

- [ ] **Step 9: Add the same nav link to `src/app/guest-play-page.tsx`**

Change:

```tsx
import { Header } from '@/components/ui/header'
import { LevelList } from '@/components/level-list'
```

to:

```tsx
import { Header } from '@/components/ui/header'
import { LinkButton } from '@/components/ui/button'
import { LevelList } from '@/components/level-list'
```

Change:

```tsx
      <main className="max-w-3xl lg:max-w-5xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        {levels ? <LevelList levels={levels} /> : <p>Loading...</p>}
      </main>
```

to:

```tsx
      <main className="max-w-3xl lg:max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h1 className="text-3xl font-extrabold text-brand-ink">Choose a level</h1>
          <LinkButton href="/pet" variant="secondary">
            🐾 My Pet
          </LinkButton>
        </div>
        {levels ? <LevelList levels={levels} /> : <p>Loading...</p>}
      </main>
```

- [ ] **Step 10: Add assertions for the new link**

In `src/app/play/page.test.tsx`, add to the `'shows unlocked levels with a Listen & Tap link and locked levels as plain text'` test (or any test that already renders the authenticated page), after the existing assertions:

```ts
expect(screen.getByRole('link', { name: /my pet/i })).toHaveAttribute('href', '/pet')
```

`src/app/guest-play-page.test.tsx` currently reads:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { GuestPlayPage } from './guest-play-page'

describe('GuestPlayPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
  })

  it('shows a reset-progress button', async () => {
    render(<GuestPlayPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /reset progress/i })).toBeInTheDocument())
  })
})
```

Add a new test inside the same `describe` block, after `'shows a reset-progress button'`:

```tsx
  it('links to the pet page', async () => {
    render(<GuestPlayPage />)
    await waitFor(() => expect(screen.getByRole('link', { name: /my pet/i })).toHaveAttribute('href', '/pet'))
  })
```

- [ ] **Step 11: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 12: Run lint and build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 13: Commit**

```bash
git add src/app/pet src/app/guest-pet-page.tsx src/app/guest-pet-page.test.tsx src/app/play/page.tsx src/app/play/page.test.tsx src/app/guest-play-page.tsx src/app/guest-play-page.test.tsx
git commit -m "feat: add /pet route and link it from the level-select pages"
```

---

### Task 9: Content generation and sync tooling

**Files:**
- Create: `scripts/generate-accessory.ts`
- Create: `scripts/sync-rewards.ts`
- Create: `scripts/render-pet-debug.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `generateImage`, `createImageGenDeps`, `DEFAULT_STYLE_SUFFIX` from `../src/lib/content/image-gen`; `resizeImage` from `../src/lib/content/image-resize`; `chromaKeyToTransparent` from `../src/lib/content/image-transparency` (Task 3); `uploadAsset` from `../src/lib/content/storage`; `PET`, `ACCESSORIES` from `../content/rewards` (Task 2).
- Produces: `npm run generate-accessory`, `npm run sync-rewards`, `npm run render-pet-debug` — no unit tests, matching the existing no-test convention for `scripts/generate-images.ts`, `scripts/sync-content.ts`, etc.

- [ ] **Step 1: Create the accessory-generation script**

The pet's own base image needs no new tooling — it's generated exactly like any other custom image with the existing `npm run generate-one -- content/images/pets/fox.png "<description>"` (Task 10 uses this directly). Only accessories need the new chroma-key step.

Create `scripts/generate-accessory.ts`:

```ts
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { generateImage, createImageGenDeps, DEFAULT_STYLE_SUFFIX } from '../src/lib/content/image-gen'
import { resizeImage } from '../src/lib/content/image-resize'
import { chromaKeyToTransparent } from '../src/lib/content/image-transparency'

const KEY_COLOR = { r: 0, g: 255, b: 0 }
const CHROMA_STYLE_SUFFIX = `${DEFAULT_STYLE_SUFFIX}, isolated on a solid pure green background (#00FF00), no shadow, no other objects`

async function main() {
  const [, , outputPath, description] = process.argv
  if (!outputPath || !description) {
    throw new Error('Usage: npm run generate-accessory -- <output-path.png> "<description>"')
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT to your GCP project id before running this script')
  }

  const deps = createImageGenDeps()
  console.log(`Generating "${description}" on a chroma-key background`)
  const raw = await generateImage(projectId, description, deps, CHROMA_STYLE_SUFFIX)
  const resized = await resizeImage(raw, 512)
  const transparent = await chromaKeyToTransparent(resized, KEY_COLOR)

  const resolvedPath = path.resolve(outputPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, transparent)
  console.log(`Saved ${resolvedPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 2: Create the sync script**

Create `scripts/sync-rewards.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createSupabaseServerClient } from '../src/lib/supabase/client'
import { uploadAsset } from '../src/lib/content/storage'
import { PET, ACCESSORIES } from '../content/rewards'

async function main() {
  const supabase = createSupabaseServerClient()

  const petImagePath = path.join(process.cwd(), 'content', 'images', 'pets', `${PET.slug}.png`)
  const petImageBuffer = readFileSync(petImagePath)
  await uploadAsset(supabase, 'pet-images', `${PET.slug}.png`, petImageBuffer, 'image/png')
  console.log(`Synced pet: ${PET.slug}`)

  for (const accessory of ACCESSORIES) {
    const imagePath = path.join(process.cwd(), 'content', 'images', 'pets', 'accessories', `${accessory.slug}.png`)
    const imageBuffer = readFileSync(imagePath)
    await uploadAsset(supabase, 'accessory-images', `${accessory.slug}.png`, imageBuffer, 'image/png')
    console.log(`Synced accessory: ${accessory.slug}`)
  }

  console.log(`Done. Synced 1 pet and ${ACCESSORIES.length} accessories.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 3: Create the debug-composite script**

Create `scripts/render-pet-debug.ts` — composites the real transparent accessory images onto the real pet image at their configured positions, for visually verifying `content/rewards.ts`'s percent values (mirrors the role `render-scene-debug.ts` plays for `SCENE_OBJECTS`, but actually composites real transparency instead of drawing labeled boxes, since the point here is validating the chroma-key + layering pipeline itself):

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { PET, ACCESSORIES } from '../content/rewards'

async function main() {
  const petImagePath = path.join(process.cwd(), 'content', 'images', 'pets', `${PET.slug}.png`)
  const petImageBuffer = readFileSync(petImagePath)
  const metadata = await sharp(petImageBuffer).metadata()
  const width = metadata.width ?? 512
  const height = metadata.height ?? 512

  const composites = await Promise.all(
    ACCESSORIES.map(async (accessory) => {
      const accessoryPath = path.join(process.cwd(), 'content', 'images', 'pets', 'accessories', `${accessory.slug}.png`)
      const accessoryBuffer = readFileSync(accessoryPath)
      const targetWidth = Math.round((accessory.widthPercent / 100) * width)
      const resized = await sharp(accessoryBuffer).resize(targetWidth).toBuffer()
      return {
        input: resized,
        left: Math.round((accessory.xPercent / 100) * width),
        top: Math.round((accessory.yPercent / 100) * height),
      }
    })
  )

  const output = await sharp(petImageBuffer).composite(composites).png().toBuffer()
  const outputPath = path.join(process.cwd(), 'content', 'images', 'pets', 'pet-debug.png')
  writeFileSync(outputPath, output)
  console.log(`Wrote debug composite to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 4: Add npm scripts**

In `package.json`, add to the `"scripts"` object, alongside the existing `generate-one`/`sync-scenes` entries:

```json
"generate-accessory": "tsx --env-file=.env.local scripts/generate-accessory.ts",
"sync-rewards": "tsx --env-file=.env.local scripts/sync-rewards.ts",
"render-pet-debug": "tsx scripts/render-pet-debug.ts",
```

- [ ] **Step 5: Run the full test suite, lint, and build**

Run: `npm test`
Expected: all tests still pass (these scripts have no tests, matching sibling scripts).

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-accessory.ts scripts/sync-rewards.ts scripts/render-pet-debug.ts package.json
git commit -m "feat: add pet/accessory generation, sync, and debug-preview scripts"
```

---

### Task 10: Generate and sync real content

**Files:**
- Modify: `content/rewards.ts` (adjust `xPercent`/`yPercent`/`widthPercent` after inspecting real images)
- Create: `content/images/pets/fox.png`
- Create: `content/images/pets/accessories/bow.png`
- Create: `content/images/pets/accessories/glasses.png`
- Create: `content/images/pets/accessories/party-hat.png`

**Interfaces:**
- Consumes: `npm run generate-one`, `npm run generate-accessory`, `npm run render-pet-debug`, `npm run sync-rewards` (Task 9); requires `GOOGLE_CLOUD_PROJECT` set in the environment, and Supabase Storage buckets `pet-images` and `accessory-images` to exist (create them in the Supabase dashboard, matching how `vocab-images`/`vocab-audio`/`scene-images` were created for earlier content, before running the sync script).
- Produces: real, committed image assets and a live, working `/pet` page.

This task is manual/iterative — expect to regenerate an image or re-run the debug composite more than once. Do not treat a single generation attempt as sufficient without visually checking the result, the same way scene hotspots needed re-inspection after the Pixar-style regeneration earlier in this project's history.

- [ ] **Step 1: Generate the pet base image**

```bash
GOOGLE_CLOUD_PROJECT=<your-project-id> npm run generate-one -- content/images/pets/fox.png "a friendly cartoon fox sitting down, facing forward, centered, full body visible"
```

Open the resulting `content/images/pets/fox.png` and confirm it's a clean, centered, full-body pose (this exact pose is what every accessory position will be authored against).

- [ ] **Step 2: Generate each accessory**

```bash
GOOGLE_CLOUD_PROJECT=<your-project-id> npm run generate-accessory -- content/images/pets/accessories/bow.png "a cute red bow accessory"
GOOGLE_CLOUD_PROJECT=<your-project-id> npm run generate-accessory -- content/images/pets/accessories/glasses.png "a pair of round cartoon glasses"
GOOGLE_CLOUD_PROJECT=<your-project-id> npm run generate-accessory -- content/images/pets/accessories/party-hat.png "a colorful cartoon party hat"
```

Open each resulting PNG. Check for two things: (a) the background is genuinely transparent, not just visually similar to it — a straightforward check is opening the file in an image viewer that shows a transparency checkerboard; (b) no visible fringe/halo of the old background color around the subject's edges. If either check fails, first try regenerating with the same prompt (AI output varies run to run); if that doesn't help, try widening or narrowing the tolerance passed to `chromaKeyToTransparent` in `scripts/generate-accessory.ts`, or adjust the prompt to more explicitly ask for hard edges and no soft shadow.

- [ ] **Step 3: Preview the composite and adjust positions**

```bash
npm run render-pet-debug
```

Open `content/images/pets/pet-debug.png`. For each accessory that looks mispositioned (off-center, wrong scale, floating away from the body), adjust its `xPercent`/`yPercent`/`widthPercent` in `content/rewards.ts` and re-run `npm run render-pet-debug` until all three sit naturally on the fox.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests still pass (`content/rewards.test.ts` validates the adjusted values are still within bounds).

- [ ] **Step 5: Create the Storage buckets and sync**

In the Supabase dashboard, create two new public Storage buckets: `pet-images` and `accessory-images` (matching how `vocab-images` and `scene-images` were created for earlier content).

```bash
GOOGLE_CLOUD_PROJECT=<your-project-id> npm run sync-rewards
```

Expected output: `Synced pet: fox`, three `Synced accessory: ...` lines, and `Done. Synced 1 pet and 3 accessories.`

- [ ] **Step 6: Apply the migration**

Apply `supabase/migrations/0005_create_kid_accessories.sql` to the project's Supabase instance (via the Supabase dashboard's SQL editor or CLI, matching how earlier migrations in this project were applied).

- [ ] **Step 7: Manual verification**

Start the dev server (`npm run dev`) and visit `/pet` as a guest: confirm the fox renders, the star balance matches guest progress, buying an affordable accessory shows it on the fox immediately, and unequipping hides it again without losing ownership (buying it again should not be offered — it should show the Equip/Unequip toggle instead of a Buy button).

- [ ] **Step 8: Commit**

```bash
git add content/rewards.ts content/images/pets
git commit -m "feat: generate and sync real pet and accessory content"
```

---

## Final Verification

- [ ] Run `npm test`, `npm run lint`, `npm run build` one more time — all green.
- [ ] Confirm both the guest and signed-in `/pet` flows work end to end in the browser (buy, equip, unequip, balance updates correctly, disabled Buy button when unaffordable).
- [ ] Confirm Reset progress (guest) also clears purchased accessories.
