# Dub Sync Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual/caption-based dub-sync segment creation with a speaker-diarization transcription pipeline (both languages), and consolidate all content-management actions into a single password-gated admin page, separate from the open player.

**Architecture:** A new lightweight admin session (mirroring the existing kids'-app `iron-session` pattern, but a distinct cookie) gates a new `/dub-sync/admin` page and the existing mutating dub-sync API routes. A new transcription pipeline shells out to `yt-dlp` to download audio and Google Cloud Speech-to-Text (with diarization) to transcribe both the Cantonese and English videos, pairs their speaker turns 1:1 when counts match (falling back to the existing proportional-normalization formula otherwise), and saves the result as segments through the existing DB layer. The old per-episode editor page is deleted; its functionality moves into the admin page alongside a new auto-mark trigger and an inline-editable segment table.

**Tech Stack:** Next.js App Router, `iron-session`, Supabase, `@google-cloud/speech` (new dependency), `yt-dlp` (external CLI tool, not an npm package), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-dub-sync-admin-design.md`

## Global Constraints

- `DUB_SYNC_ADMIN_PASSWORD` env var holds the single shared admin password; never stored anywhere, only compared at login.
- The admin session reuses the existing `SESSION_SECRET` env var (already required to be 32+ characters) — no new secret.
- `yt-dlp` must be on `PATH` wherever the Next.js server runs; this is a manual local prerequisite, not something the app installs.
- Downloaded audio is never kept or served — always deleted after transcription, including on error paths.
- The player (`/dub-sync/[episodeId]`) stays fully open — no auth changes there.
- Run `npm test` and `npm run lint` after every task; both must pass before committing.

---

## Task 1: Admin session module

**Files:**
- Create: `src/lib/auth/admin-session.ts`
- Test: `src/lib/auth/admin-session.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AdminSessionData {
    isAdmin: true
  }
  export const ADMIN_COOKIE_NAME = 'dub_sync_admin_session'
  export async function createAdminSessionCookieValue(data: AdminSessionData): Promise<string>
  export async function readAdminSessionFromCookieValue(cookie: string | undefined): Promise<AdminSessionData | null>
  export async function readAdminSession(request: NextRequest): Promise<AdminSessionData | null>
  export function setAdminSessionCookie(response: NextResponse, value: string): void
  export function clearAdminSessionCookie(response: NextResponse): void
  ```
  Consumed by every task from here on that needs to check or set the admin session (Tasks 2, 4, 9, 10).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  createAdminSessionCookieValue,
  readAdminSession,
  readAdminSessionFromCookieValue,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  ADMIN_COOKIE_NAME,
} from './admin-session'

describe('admin-session', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('round-trips session data through a cookie', async () => {
    const value = await createAdminSessionCookieValue({ isAdmin: true })

    const response = NextResponse.next()
    setAdminSessionCookie(response, value)
    const cookieValue = response.cookies.get(ADMIN_COOKIE_NAME)?.value
    expect(cookieValue).toBeDefined()

    const request = new NextRequest('http://localhost/api/dub-sync/episodes', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${cookieValue}` },
    })
    const session = await readAdminSession(request)
    expect(session).toEqual({ isAdmin: true })
  })

  it('returns null when no cookie is present', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes')
    expect(await readAdminSession(request)).toBeNull()
  })

  it('returns null for a garbage cookie value', async () => {
    expect(await readAdminSessionFromCookieValue('not-a-valid-sealed-value')).toBeNull()
  })

  it('clears the cookie', () => {
    const response = NextResponse.next()
    clearAdminSessionCookie(response)
    expect(response.cookies.get(ADMIN_COOKIE_NAME)?.value).toBe('')
  })

  it('throws when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET
    await expect(createAdminSessionCookieValue({ isAdmin: true })).rejects.toThrow(
      'SESSION_SECRET must be set'
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- admin-session.test.ts`
Expected: FAIL with "Cannot find module './admin-session'"

- [ ] **Step 3: Implement**

```ts
import { sealData, unsealData } from 'iron-session'
import type { NextRequest, NextResponse } from 'next/server'

export interface AdminSessionData {
  isAdmin: true
}

export const ADMIN_COOKIE_NAME = 'dub_sync_admin_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

function getSessionPassword(): string {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set to a string of at least 32 characters')
  }
  return password
}

export async function createAdminSessionCookieValue(data: AdminSessionData): Promise<string> {
  return sealData(data, { password: getSessionPassword() })
}

export async function readAdminSessionFromCookieValue(
  cookie: string | undefined
): Promise<AdminSessionData | null> {
  if (!cookie) return null
  try {
    return await unsealData<AdminSessionData>(cookie, { password: getSessionPassword() })
  } catch {
    return null
  }
}

export async function readAdminSession(request: NextRequest): Promise<AdminSessionData | null> {
  return readAdminSessionFromCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
}

export function setAdminSessionCookie(response: NextResponse, value: string): void {
  response.cookies.set(ADMIN_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE_NAME, '', { maxAge: 0, path: '/' })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- admin-session.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/admin-session.ts src/lib/auth/admin-session.test.ts
git commit -m "feat: add dub-sync admin session module"
```

---

## Task 2: Admin login and logout routes

**Files:**
- Create: `src/app/api/dub-sync/login/route.ts`
- Test: `src/app/api/dub-sync/login/route.test.ts`
- Create: `src/app/api/dub-sync/logout/route.ts`
- Test: `src/app/api/dub-sync/logout/route.test.ts`

**Interfaces:**
- Consumes: `createAdminSessionCookieValue`, `setAdminSessionCookie`, `clearAdminSessionCookie`, `ADMIN_COOKIE_NAME` (Task 1).
- Produces: `POST /api/dub-sync/login` → `{ ok: true }` (200, sets cookie) or `{ error }` (401); `POST /api/dub-sync/logout` → `{ ok: true }` (200, clears cookie). Consumed by Task 3 (login page).

- [ ] **Step 1: Write the failing tests for login**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'
import { POST } from './route'

describe('POST /api/dub-sync/login', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    process.env.DUB_SYNC_ADMIN_PASSWORD = 'secret-pass'
  })

  it('sets the admin session cookie when the password matches', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret-pass' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.cookies.get(ADMIN_COOKIE_NAME)?.value).toBeTruthy()
  })

  it('rejects an incorrect password', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('throws when DUB_SYNC_ADMIN_PASSWORD is not set', async () => {
    delete process.env.DUB_SYNC_ADMIN_PASSWORD
    const request = new NextRequest('http://localhost/api/dub-sync/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'anything' }),
      headers: { 'content-type': 'application/json' },
    })
    await expect(POST(request)).rejects.toThrow('DUB_SYNC_ADMIN_PASSWORD must be set')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/dub-sync/login/route.test.ts`
Expected: FAIL with "Cannot find module './route'"

- [ ] **Step 3: Implement the login route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSessionCookieValue, setAdminSessionCookie } from '@/lib/auth/admin-session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''

  const adminPassword = process.env.DUB_SYNC_ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('DUB_SYNC_ADMIN_PASSWORD must be set')
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const cookieValue = await createAdminSessionCookieValue({ isAdmin: true })
  const response = NextResponse.json({ ok: true })
  setAdminSessionCookie(response, cookieValue)
  return response
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/dub-sync/login/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for logout**

```ts
import { describe, it, expect } from 'vitest'
import { ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'
import { POST } from './route'

describe('POST /api/dub-sync/logout', () => {
  it('clears the admin session cookie', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(response.cookies.get(ADMIN_COOKIE_NAME)?.value).toBe('')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/app/api/dub-sync/logout/route.test.ts`
Expected: FAIL with "Cannot find module './route'"

- [ ] **Step 7: Implement the logout route**

```ts
import { NextResponse } from 'next/server'
import { clearAdminSessionCookie } from '@/lib/auth/admin-session'

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true })
  clearAdminSessionCookie(response)
  return response
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/app/api/dub-sync/logout/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 9: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/app/api/dub-sync/login src/app/api/dub-sync/logout
git commit -m "feat: add dub-sync admin login and logout routes"
```

---

## Task 3: Admin login page

**Files:**
- Create: `src/app/dub-sync/login/page.tsx`
- Test: `src/app/dub-sync/login/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/dub-sync/login` (Task 2).
- Produces: the `/dub-sync/login` route. Linked to by every gated page's redirect (Task 4, 9, 10).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

import DubSyncLoginPage from './page'

describe('DubSyncLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits the password and navigates to the admin page on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) }))
    render(<DubSyncLoginPage />)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dub-sync/admin'))
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ password: 'secret-pass' }) })
    )
  })

  it('shows an error message on an incorrect password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<DubSyncLoginPage />)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/dub-sync/login/page.test.tsx`
Expected: FAIL with "Cannot find module './page'"

- [ ] **Step 3: Implement**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function DubSyncLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const response = await fetch('/api/dub-sync/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setSubmitting(false)
    if (!response.ok) {
      setError('Incorrect password')
      return
    }
    router.push('/dub-sync/admin')
  }

  return (
    <main className="max-w-sm mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Dub Sync Admin Login</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="border p-2 rounded"
          />
        </label>
        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className="border p-2 rounded bg-gray-800 text-white">
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/dub-sync/login/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/app/dub-sync/login
git commit -m "feat: add dub-sync admin login page"
```

---

## Task 4: Gate existing mutating dub-sync routes

**Files:**
- Modify: `src/app/api/dub-sync/episodes/route.ts`, `src/app/api/dub-sync/episodes/route.test.ts`
- Modify: `src/app/api/dub-sync/episodes/[episodeId]/route.ts`, `.../route.test.ts`
- Modify: `src/app/api/dub-sync/episodes/[episodeId]/segments/route.ts`, `.../route.test.ts`
- Modify: `src/app/api/dub-sync/episodes/[episodeId]/segments/[segmentId]/route.ts`, `.../route.test.ts`
- Modify: `src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.ts`, `.../route.test.ts`

**Interfaces:**
- Consumes: `readAdminSession` (Task 1).
- Produces: each route now returns `401` with `{ error: 'Not authenticated' }` when the admin cookie is missing/invalid; behavior otherwise unchanged. Every existing test's "success" case must now include a valid admin cookie.

- [ ] **Step 1: Write the failing tests** (append an admin cookie helper + a 401 test to each of the 5 test files; update each existing success test to include the cookie)

`src/app/api/dub-sync/episodes/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  createEpisode: vi.fn(),
}))

import { POST } from './route'
import { createEpisode } from '@/lib/db/dub-sync'

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

describe('POST /api/dub-sync/episodes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an episode and returns it', async () => {
    vi.mocked(createEpisode).mockResolvedValue({
      id: 'ep-1',
      title: 'Muddy Puddles',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
      cantoContentStart: null,
      cantoContentEnd: null,
      englishContentStart: null,
      englishContentEnd: null,
    })

    const request = new NextRequest('http://localhost/api/dub-sync/episodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Muddy Puddles', cantoneseVideoId: 'canto-123', englishVideoId: 'eng-456' }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.episode.id).toBe('ep-1')
    expect(createEpisode).toHaveBeenCalledWith(expect.anything(), {
      title: 'Muddy Puddles',
      cantoneseVideoId: 'canto-123',
      englishVideoId: 'eng-456',
    })
  })

  it('rejects a request missing required fields', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Muddy Puddles' }),
      headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'X', cantoneseVideoId: 'a', englishVideoId: 'b' }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })
})
```

The same three-part change (cookie helper, cookie added to every existing success/validation test, one new "rejects an unauthenticated request" test) applies to the other four test files:

`src/app/api/dub-sync/episodes/[episodeId]/route.test.ts` — add the cookie header to both existing tests' `makeRequest` calls (change `makeRequest` to `async function makeRequest(body: unknown)` returning a `NextRequest` built with `headers: { 'content-type': 'application/json', cookie: await adminCookieHeader() }`, and `await` its call sites), and add:

```ts
it('rejects an unauthenticated request', async () => {
  const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1', {
    method: 'PATCH',
    body: JSON.stringify({ cantoContentStart: 10, cantoContentEnd: 110, englishContentStart: 20, englishContentEnd: 220 }),
    headers: { 'content-type': 'application/json' },
  })
  const response = await PATCH(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
  expect(response.status).toBe(401)
})
```

`src/app/api/dub-sync/episodes/[episodeId]/segments/route.test.ts` — add the cookie header to both existing requests' `headers`, and add:

```ts
it('rejects an unauthenticated request', async () => {
  const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments', {
    method: 'POST',
    body: JSON.stringify({ cantoStart: 1, cantoEnd: 2, englishStart: 1, englishEnd: 2 }),
    headers: { 'content-type': 'application/json' },
  })
  const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
  expect(response.status).toBe(401)
})
```

`src/app/api/dub-sync/episodes/[episodeId]/segments/[segmentId]/route.test.ts` — add the cookie header to both existing requests' `headers`, and add:

```ts
it('rejects an unauthenticated PATCH', async () => {
  const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments/seg-1', {
    method: 'PATCH',
    body: JSON.stringify({ cantoEnd: 16.0 }),
    headers: { 'content-type': 'application/json' },
  })
  const response = await PATCH(request, { params })
  expect(response.status).toBe(401)
})

it('rejects an unauthenticated DELETE', async () => {
  const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/segments/seg-1', { method: 'DELETE' })
  const response = await DELETE(request, { params })
  expect(response.status).toBe(401)
})
```

`src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.test.ts` — change `makeRequest` to `async function makeRequest()` adding `headers: { cookie: await adminCookieHeader() }`, `await` its call sites, and add:

```ts
it('rejects an unauthenticated request', async () => {
  const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/generate-segments', { method: 'POST' })
  const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
  expect(response.status).toBe(401)
})
```

- [ ] **Step 2: Run the dub-sync API tests to verify the new tests fail**

Run: `npm test -- src/app/api/dub-sync`
Expected: FAIL — the new "rejects an unauthenticated request" tests get 200/201/400 instead of 401 (no gating yet)

- [ ] **Step 3: Add the auth check to each route**

`src/app/api/dub-sync/episodes/route.ts` — add after the imports and at the top of `POST`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { createEpisode } from '@/lib/db/dub-sync'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  // ...rest unchanged
```

Apply the identical two-line addition (`const session = await readAdminSession(request)` + the `if (!session) { ... }` guard, plus the `readAdminSession` import) as the first lines inside each exported handler in:
- `src/app/api/dub-sync/episodes/[episodeId]/route.ts` (`PATCH`)
- `src/app/api/dub-sync/episodes/[episodeId]/segments/route.ts` (`POST`)
- `src/app/api/dub-sync/episodes/[episodeId]/segments/[segmentId]/route.ts` (both `PATCH` and `DELETE`)
- `src/app/api/dub-sync/episodes/[episodeId]/generate-segments/route.ts` (`POST`)

- [ ] **Step 4: Run the dub-sync API tests to verify they pass**

Run: `npm test -- src/app/api/dub-sync`
Expected: PASS (all tests, including the new 401 cases)

- [ ] **Step 5: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/app/api/dub-sync
git commit -m "feat: require admin session on mutating dub-sync API routes"
```

---

## Task 5: groupWordsBySpeaker

**Files:**
- Create: `src/lib/dub-sync/group-words-by-speaker.ts`
- Test: `src/lib/dub-sync/group-words-by-speaker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TranscribedWord {
    text: string
    startTime: number
    endTime: number
    speakerTag: number
  }
  export interface WordGroup {
    start: number
    end: number
  }
  export function groupWordsBySpeaker(words: TranscribedWord[]): WordGroup[]
  ```
  `TranscribedWord` is re-used (as a type-only import) by Task 8 (`transcribe.ts`, which produces `TranscribedWord[]`). `WordGroup` is consumed by Task 7 (`pairDiarizedTurns`) and Task 6 (the loosened `cuesToCandidateSegments` parameter type).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { groupWordsBySpeaker, type TranscribedWord } from './group-words-by-speaker'

function word(overrides: Partial<TranscribedWord>): TranscribedWord {
  return { text: 'word', startTime: 0, endTime: 0, speakerTag: 1, ...overrides }
}

describe('groupWordsBySpeaker', () => {
  it('groups consecutive words from the same speaker into one segment', () => {
    const words = [
      word({ startTime: 0, endTime: 0.5, speakerTag: 1 }),
      word({ startTime: 0.5, endTime: 1.0, speakerTag: 1 }),
      word({ startTime: 1.0, endTime: 1.5, speakerTag: 1 }),
    ]
    expect(groupWordsBySpeaker(words)).toEqual([{ start: 0, end: 1.5 }])
  })

  it('starts a new group when the speaker tag changes', () => {
    const words = [
      word({ startTime: 0, endTime: 0.5, speakerTag: 1 }),
      word({ startTime: 0.5, endTime: 1.0, speakerTag: 1 }),
      word({ startTime: 1.2, endTime: 1.8, speakerTag: 2 }),
      word({ startTime: 1.8, endTime: 2.3, speakerTag: 2 }),
    ]
    expect(groupWordsBySpeaker(words)).toEqual([
      { start: 0, end: 1.0 },
      { start: 1.2, end: 2.3 },
    ])
  })

  it('returns one group per word when every word has a different speaker', () => {
    const words = [
      word({ startTime: 0, endTime: 0.5, speakerTag: 1 }),
      word({ startTime: 0.6, endTime: 1.1, speakerTag: 2 }),
      word({ startTime: 1.2, endTime: 1.7, speakerTag: 3 }),
    ]
    expect(groupWordsBySpeaker(words)).toEqual([
      { start: 0, end: 0.5 },
      { start: 0.6, end: 1.1 },
      { start: 1.2, end: 1.7 },
    ])
  })

  it('returns an empty array for no words', () => {
    expect(groupWordsBySpeaker([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- group-words-by-speaker.test.ts`
Expected: FAIL with "Cannot find module './group-words-by-speaker'"

- [ ] **Step 3: Implement**

```ts
export interface TranscribedWord {
  text: string
  startTime: number
  endTime: number
  speakerTag: number
}

export interface WordGroup {
  start: number
  end: number
}

export function groupWordsBySpeaker(words: TranscribedWord[]): WordGroup[] {
  const groups: WordGroup[] = []

  for (const word of words) {
    const lastWord = words[words.indexOf(word) - 1]
    const currentGroup = groups[groups.length - 1]

    if (currentGroup && lastWord && lastWord.speakerTag === word.speakerTag) {
      currentGroup.end = word.endTime
    } else {
      groups.push({ start: word.startTime, end: word.endTime })
    }
  }

  return groups
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- group-words-by-speaker.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dub-sync/group-words-by-speaker.ts src/lib/dub-sync/group-words-by-speaker.test.ts
git commit -m "feat: add groupWordsBySpeaker for diarization-based segmentation"
```

---

## Task 6: Loosen candidate-segments.ts's cue type

**Files:**
- Modify: `src/lib/dub-sync/candidate-segments.ts`
- Modify: `src/lib/dub-sync/candidate-segments.test.ts` (no behavioral change, just re-run to confirm nothing broke)

**Interfaces:**
- Produces: `cuesToCandidateSegments` now accepts a minimal `{ start: number; end: number }[]` instead of `CaptionCue[]`, so `WordGroup[]` (Task 5) satisfies it directly. Consumed by Task 7 (`pairDiarizedTurns`'s fallback path) and unchanged for the existing `CaptionCue[]` caller (`generate-segments/route.ts`, which still type-checks since `CaptionCue` structurally satisfies the loosened type).

- [ ] **Step 1: Run the existing tests to confirm today's baseline passes**

Run: `npm test -- candidate-segments.test.ts`
Expected: PASS (4 tests, unchanged from before this task)

- [ ] **Step 2: Loosen the type**

In `src/lib/dub-sync/candidate-segments.ts`, replace the `CaptionCue` import and the function signature:

```ts
import type { EpisodeAnchors } from './normalize'
import { englishTimeFor } from './normalize'

export interface TimedCue {
  start: number
  end: number
}

export interface CandidateSegment {
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

export function cuesToCandidateSegments(cues: TimedCue[], anchors: EpisodeAnchors): CandidateSegment[] {
  return cues
    .filter((cue) => cue.start >= anchors.cantoContentStart && cue.end <= anchors.cantoContentEnd)
    .map((cue) => ({
      cantoStart: cue.start,
      cantoEnd: cue.end,
      englishStart: englishTimeFor(cue.start, anchors),
      englishEnd: englishTimeFor(cue.end, anchors),
    }))
}
```

(The `import type { CaptionCue } from './captions'` line is removed — nothing in this file references `CaptionCue` any more.)

- [ ] **Step 3: Run tests and full suite to confirm nothing broke**

Run: `npm test -- candidate-segments.test.ts`
Expected: PASS (4 tests, same as Step 1 — the test file itself needs no changes, since its fixtures already only use `{start, end, text}` objects, which still satisfy the loosened type)

Run: `npm test`
Expected: PASS (all tests, including `generate-segments/route.test.ts`, whose `CaptionCue[]`-shaped mocks still type-check and pass against the loosened signature)

- [ ] **Step 4: Run lint, then commit**

```bash
npm run lint
git add src/lib/dub-sync/candidate-segments.ts
git commit -m "refactor: loosen cuesToCandidateSegments to accept any timed cue"
```

---

## Task 7: pairDiarizedTurns

**Files:**
- Create: `src/lib/dub-sync/pair-diarized-turns.ts`
- Test: `src/lib/dub-sync/pair-diarized-turns.test.ts`

**Interfaces:**
- Consumes: `WordGroup` (Task 5), `EpisodeAnchors` (existing, `src/lib/dub-sync/normalize.ts`), `cuesToCandidateSegments` (Task 6).
- Produces:
  ```ts
  export interface DiarizedSegment {
    cantoStart: number
    cantoEnd: number
    englishStart: number
    englishEnd: number
  }
  export interface PairDiarizedTurnsResult {
    segments: DiarizedSegment[]
    usedFallback: boolean
  }
  export function pairDiarizedTurns(
    cantoTurns: WordGroup[],
    englishTurns: WordGroup[],
    anchors: EpisodeAnchors
  ): PairDiarizedTurnsResult
  ```
  Consumed by Task 9 (the auto-mark route).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { pairDiarizedTurns } from './pair-diarized-turns'
import type { WordGroup } from './group-words-by-speaker'
import type { EpisodeAnchors } from './normalize'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('pairDiarizedTurns', () => {
  it('pairs turns 1:1 by order when both sides have the same count', () => {
    const cantoTurns: WordGroup[] = [
      { start: 10, end: 15 },
      { start: 20, end: 25 },
    ]
    const englishTurns: WordGroup[] = [
      { start: 21, end: 27 },
      { start: 40, end: 46 },
    ]

    const result = pairDiarizedTurns(cantoTurns, englishTurns, anchors)

    expect(result.usedFallback).toBe(false)
    expect(result.segments).toEqual([
      { cantoStart: 10, cantoEnd: 15, englishStart: 21, englishEnd: 27 },
      { cantoStart: 20, cantoEnd: 25, englishStart: 40, englishEnd: 46 },
    ])
  })

  it('excludes turns outside each side\'s content anchors before comparing counts', () => {
    const cantoTurns: WordGroup[] = [
      { start: 2, end: 5 }, // before cantoContentStart (10) — excluded
      { start: 10, end: 15 },
    ]
    const englishTurns: WordGroup[] = [
      { start: 21, end: 27 },
      { start: 300, end: 310 }, // after englishContentEnd (220) — excluded
    ]

    const result = pairDiarizedTurns(cantoTurns, englishTurns, anchors)

    expect(result.usedFallback).toBe(false)
    expect(result.segments).toEqual([{ cantoStart: 10, cantoEnd: 15, englishStart: 21, englishEnd: 27 }])
  })

  it('falls back to proportional stretch when the turn counts differ', () => {
    const cantoTurns: WordGroup[] = [
      { start: 10, end: 15 },
      { start: 20, end: 25 },
    ]
    const englishTurns: WordGroup[] = [{ start: 21, end: 27 }]

    const result = pairDiarizedTurns(cantoTurns, englishTurns, anchors)

    expect(result.usedFallback).toBe(true)
    expect(result.segments).toHaveLength(2)
    // englishStart/englishEnd come from englishTimeFor, not from the (mismatched) englishTurns
    expect(result.segments[0]).toEqual({ cantoStart: 10, cantoEnd: 15, englishStart: 20, englishEnd: 21 })
  })

  it('falls back when one side has no turns at all', () => {
    const cantoTurns: WordGroup[] = [{ start: 10, end: 15 }]
    const result = pairDiarizedTurns(cantoTurns, [], anchors)
    expect(result.usedFallback).toBe(true)
    expect(result.segments).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- pair-diarized-turns.test.ts`
Expected: FAIL with "Cannot find module './pair-diarized-turns'"

- [ ] **Step 3: Implement**

```ts
import type { WordGroup } from './group-words-by-speaker'
import type { EpisodeAnchors } from './normalize'
import { cuesToCandidateSegments } from './candidate-segments'

export interface DiarizedSegment {
  cantoStart: number
  cantoEnd: number
  englishStart: number
  englishEnd: number
}

export interface PairDiarizedTurnsResult {
  segments: DiarizedSegment[]
  usedFallback: boolean
}

export function pairDiarizedTurns(
  cantoTurns: WordGroup[],
  englishTurns: WordGroup[],
  anchors: EpisodeAnchors
): PairDiarizedTurnsResult {
  const filteredCanto = cantoTurns.filter(
    (turn) => turn.start >= anchors.cantoContentStart && turn.end <= anchors.cantoContentEnd
  )
  const filteredEnglish = englishTurns.filter(
    (turn) => turn.start >= anchors.englishContentStart && turn.end <= anchors.englishContentEnd
  )

  if (filteredCanto.length > 0 && filteredCanto.length === filteredEnglish.length) {
    return {
      segments: filteredCanto.map((canto, index) => ({
        cantoStart: canto.start,
        cantoEnd: canto.end,
        englishStart: filteredEnglish[index].start,
        englishEnd: filteredEnglish[index].end,
      })),
      usedFallback: false,
    }
  }

  return {
    segments: cuesToCandidateSegments(cantoTurns, anchors),
    usedFallback: true,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- pair-diarized-turns.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/lib/dub-sync/pair-diarized-turns.ts src/lib/dub-sync/pair-diarized-turns.test.ts
git commit -m "feat: add pairDiarizedTurns to align Cantonese and English speaker turns"
```

---

## Task 8: Audio download and transcription

**Files:**
- Modify: `package.json` (add `@google-cloud/speech` dependency)
- Create: `src/lib/dub-sync/transcribe.ts`
- Test: `src/lib/dub-sync/transcribe.test.ts`

**Interfaces:**
- Consumes: `TranscribedWord` (Task 5, type-only import).
- Produces:
  ```ts
  export async function downloadAudio(videoId: string): Promise<string>
  export async function transcribeWithDiarization(audioFilePath: string, languageCode: string): Promise<TranscribedWord[]>
  export async function deleteAudioFile(filePath: string): Promise<void>
  ```
  Consumed by Task 9 (the auto-mark route).

- [ ] **Step 1: Install the new dependency**

Run: `npm install @google-cloud/speech`

- [ ] **Step 2: Write the failing tests for downloadAudio**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { downloadAudio } from './transcribe'

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
  child.stderr = new EventEmitter()
  return child
}

describe('downloadAudio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves with a temp file path when yt-dlp exits successfully', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('close', 0)

    const path = await promise
    expect(path).toMatch(/video-1/)
    expect(path.endsWith('.mp3')).toBe(true)
  })

  it('rejects with the captured stderr when yt-dlp exits with a non-zero code', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.stderr.emit('data', Buffer.from('video unavailable'))
    child.emit('close', 1)

    await expect(promise).rejects.toThrow('video unavailable')
  })

  it('rejects with a clear message when yt-dlp cannot be started', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow('yt-dlp not found or failed to start')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- transcribe.test.ts`
Expected: FAIL with "Cannot find module './transcribe'"

- [ ] **Step 4: Implement downloadAudio and deleteAudioFile**

```ts
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SpeechClient } from '@google-cloud/speech'
import type { TranscribedWord } from './group-words-by-speaker'

export async function downloadAudio(videoId: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `dub-sync-${videoId}-${randomUUID()}.mp3`)

  await new Promise<void>((resolve, reject) => {
    const child = spawn('yt-dlp', [
      '-x',
      '--audio-format',
      'mp3',
      '-o',
      outputPath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ])

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`yt-dlp not found or failed to start: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`))
      }
    })
  })

  return outputPath
}

export async function deleteAudioFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => {})
}
```

(`transcribeWithDiarization` is added in the next step — it's declared here too since this is the same file, but tested separately below.)

- [ ] **Step 5: Run tests to verify downloadAudio passes**

Run: `npm test -- transcribe.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing tests for transcribeWithDiarization**

Append to `src/lib/dub-sync/transcribe.test.ts`:

```ts
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...actual, readFile: vi.fn() }
})

vi.mock('@google-cloud/speech', () => ({
  SpeechClient: vi.fn(),
}))

import { readFile } from 'node:fs/promises'
import { SpeechClient } from '@google-cloud/speech'
import { transcribeWithDiarization } from './transcribe'

describe('transcribeWithDiarization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('extracts words with timestamps and speaker tags from the final diarized result', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('fake-audio'))

    const fakeOperation = {
      promise: vi.fn().mockResolvedValue([
        {
          results: [
            { alternatives: [{ words: [] }] }, // earlier, non-final results are ignored
            {
              alternatives: [
                {
                  words: [
                    { word: '你好', startTime: { seconds: '0', nanos: 0 }, endTime: { seconds: '0', nanos: 500000000 }, speakerTag: 1 },
                    { word: '喬治', startTime: { seconds: '1', nanos: 0 }, endTime: { seconds: '1', nanos: 500000000 }, speakerTag: 2 },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    }
    vi.mocked(SpeechClient).mockImplementation(
      () => ({ longRunningRecognize: vi.fn().mockResolvedValue([fakeOperation]) }) as never
    )

    const words = await transcribeWithDiarization('/tmp/audio.mp3', 'yue-Hant-HK')

    expect(words).toEqual([
      { text: '你好', startTime: 0, endTime: 0.5, speakerTag: 1 },
      { text: '喬治', startTime: 1, endTime: 1.5, speakerTag: 2 },
    ])
  })

  it('returns an empty array when there are no results', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('fake-audio'))
    const fakeOperation = { promise: vi.fn().mockResolvedValue([{ results: [] }]) }
    vi.mocked(SpeechClient).mockImplementation(
      () => ({ longRunningRecognize: vi.fn().mockResolvedValue([fakeOperation]) }) as never
    )

    const words = await transcribeWithDiarization('/tmp/audio.mp3', 'en-US')
    expect(words).toEqual([])
  })
})
```

- [ ] **Step 7: Run tests to verify the new ones fail**

Run: `npm test -- transcribe.test.ts`
Expected: FAIL — `transcribeWithDiarization is not a function`

- [ ] **Step 8: Implement transcribeWithDiarization**

Append to `src/lib/dub-sync/transcribe.ts`:

```ts
export async function transcribeWithDiarization(
  audioFilePath: string,
  languageCode: string
): Promise<TranscribedWord[]> {
  const client = new SpeechClient()
  const audioBytes = await readFile(audioFilePath)

  const [operation] = await client.longRunningRecognize({
    audio: { content: audioBytes.toString('base64') },
    config: {
      encoding: 'MP3',
      languageCode,
      enableWordTimeOffsets: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 6,
      },
    },
  })

  const [response] = await operation.promise()
  const results = response.results ?? []
  const lastResult = results[results.length - 1]
  const wordInfos = lastResult?.alternatives?.[0]?.words ?? []

  return wordInfos.map((wordInfo) => ({
    text: wordInfo.word ?? '',
    startTime: secondsFromDuration(wordInfo.startTime),
    endTime: secondsFromDuration(wordInfo.endTime),
    speakerTag: wordInfo.speakerTag ?? 0,
  }))
}

function secondsFromDuration(
  duration?: { seconds?: number | string | null; nanos?: number | null } | null
): number {
  if (!duration) return 0
  const seconds = Number(duration.seconds ?? 0)
  const nanos = Number(duration.nanos ?? 0)
  return seconds + nanos / 1e9
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- transcribe.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 10: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add package.json package-lock.json src/lib/dub-sync/transcribe.ts src/lib/dub-sync/transcribe.test.ts
git commit -m "feat: add yt-dlp download and Speech-to-Text diarization pipeline"
```

---

## Task 9: Auto-mark API route

**Files:**
- Create: `src/app/api/dub-sync/episodes/[episodeId]/auto-mark/route.ts`
- Test: `src/app/api/dub-sync/episodes/[episodeId]/auto-mark/route.test.ts`

**Interfaces:**
- Consumes: `readAdminSession` (Task 1), `getEpisode`/`createSegmentsBulk` (existing, `src/lib/db/dub-sync.ts`), `downloadAudio`/`transcribeWithDiarization`/`deleteAudioFile` (Task 8), `groupWordsBySpeaker` (Task 5), `pairDiarizedTurns` (Task 7).
- Produces: `POST /api/dub-sync/episodes/[episodeId]/auto-mark` → `{ segments, warning? }` (201), or 401/404/400/502. Consumed by Task 13 (admin page auto-mark button).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createAdminSessionCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/dub-sync', () => ({
  getEpisode: vi.fn(),
  createSegmentsBulk: vi.fn(),
}))

vi.mock('@/lib/dub-sync/transcribe', () => ({
  downloadAudio: vi.fn(),
  transcribeWithDiarization: vi.fn(),
  deleteAudioFile: vi.fn(),
}))

import { POST } from './route'
import { getEpisode, createSegmentsBulk } from '@/lib/db/dub-sync'
import { downloadAudio, transcribeWithDiarization, deleteAudioFile } from '@/lib/dub-sync/transcribe'

const episodeWithAnchors = {
  id: 'ep-1',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-123',
  englishVideoId: 'eng-456',
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

async function adminCookieHeader(): Promise<string> {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  const value = await createAdminSessionCookieValue({ isAdmin: true })
  return `${ADMIN_COOKIE_NAME}=${value}`
}

async function makeRequest(): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/auto-mark', {
    method: 'POST',
    headers: { cookie: await adminCookieHeader() },
  })
}

describe('POST /api/dub-sync/episodes/[episodeId]/auto-mark', () => {
  beforeEach(() => vi.clearAllMocks())

  it('transcribes both videos, pairs turns, and bulk-creates segments', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) => Promise.resolve(`/tmp/${videoId}.mp3`))
    vi.mocked(transcribeWithDiarization).mockImplementation((path: string) =>
      path.includes('canto-123')
        ? Promise.resolve([
            { text: '你好', startTime: 10, endTime: 15, speakerTag: 1 },
          ])
        : Promise.resolve([{ text: 'Hello', startTime: 21, endTime: 27, speakerTag: 1 }])
    )
    vi.mocked(createSegmentsBulk).mockResolvedValue([
      {
        id: 'seg-1',
        episodeId: 'ep-1',
        position: 0,
        label: null,
        cantoStart: 10,
        cantoEnd: 15,
        englishStart: 21,
        englishEnd: 27,
      },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.segments).toHaveLength(1)
    expect(body.warning).toBeUndefined()
    expect(createSegmentsBulk).toHaveBeenCalledWith(expect.anything(), 'ep-1', [
      { cantoStart: 10, cantoEnd: 15, englishStart: 21, englishEnd: 27 },
    ])
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
  })

  it('includes a warning when the turn counts do not match', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) => Promise.resolve(`/tmp/${videoId}.mp3`))
    vi.mocked(transcribeWithDiarization).mockImplementation((path: string) =>
      path.includes('canto-123')
        ? Promise.resolve([
            { text: '你好', startTime: 10, endTime: 15, speakerTag: 1 },
            { text: '喬治', startTime: 20, endTime: 25, speakerTag: 2 },
          ])
        : Promise.resolve([{ text: 'Hello', startTime: 21, endTime: 27, speakerTag: 1 }])
    )
    vi.mocked(createSegmentsBulk).mockResolvedValue([])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.warning).toContain('2')
    expect(body.warning).toContain('1')
  })

  it('rejects an unauthenticated request', async () => {
    const request = new NextRequest('http://localhost/api/dub-sync/episodes/ep-1/auto-mark', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(401)
  })

  it('returns 404 when the episode does not exist', async () => {
    vi.mocked(getEpisode).mockResolvedValue(null)
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 400 when anchors are not fully set', async () => {
    vi.mocked(getEpisode).mockResolvedValue({ ...episodeWithAnchors, englishContentEnd: null })
    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })
    expect(response.status).toBe(400)
  })

  it('returns 502 and still cleans up when a download fails', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) =>
      videoId === 'canto-123' ? Promise.reject(new Error('yt-dlp not found')) : Promise.resolve('/tmp/eng-456.mp3')
    )
    // The English side must still resolve successfully so this test deterministically exercises
    // the Cantonese download failure, rather than racing against an incidentally-unmocked call.
    vi.mocked(transcribeWithDiarization).mockResolvedValue([
      { text: 'Hello', startTime: 21, endTime: 27, speakerTag: 1 },
    ])

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('canto-123')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
    expect(deleteAudioFile).not.toHaveBeenCalledWith(expect.stringContaining('canto-123'))
  })

  it('returns 502 and still cleans up both files when transcription fails on one side', async () => {
    vi.mocked(getEpisode).mockResolvedValue(episodeWithAnchors)
    vi.mocked(downloadAudio).mockImplementation((videoId: string) => Promise.resolve(`/tmp/${videoId}.mp3`))
    vi.mocked(transcribeWithDiarization).mockImplementation((path: string) =>
      path.includes('eng-456')
        ? Promise.reject(new Error('Speech-to-Text quota exceeded'))
        : Promise.resolve([{ text: '你好', startTime: 10, endTime: 15, speakerTag: 1 }])
    )

    const response = await POST(await makeRequest(), { params: Promise.resolve({ episodeId: 'ep-1' }) })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toContain('eng-456')
    expect(body.error).toContain('quota exceeded')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/canto-123.mp3')
    expect(deleteAudioFile).toHaveBeenCalledWith('/tmp/eng-456.mp3')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- 'auto-mark/route.test.ts'`
Expected: FAIL with "Cannot find module './route'"

- [ ] **Step 3: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getEpisode, createSegmentsBulk } from '@/lib/db/dub-sync'
import { readAdminSession } from '@/lib/auth/admin-session'
import { downloadAudio, transcribeWithDiarization, deleteAudioFile } from '@/lib/dub-sync/transcribe'
import { groupWordsBySpeaker } from '@/lib/dub-sync/group-words-by-speaker'
import { pairDiarizedTurns } from '@/lib/dub-sync/pair-diarized-turns'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'

// Deletes its own audio file as soon as it's done with it (success or failure), rather than
// leaving cleanup to the caller — that would require the caller to track which downloads
// actually completed, and a naive `finally` at the POST level misses this: if one video's
// transcription rejects, Promise.all rejects before the other (successful) video's path is ever
// captured in the outer scope, leaking that file.
async function transcribeVideo(videoId: string, languageCode: string) {
  const audioPath = await downloadAudio(videoId)
  try {
    const words = await transcribeWithDiarization(audioPath, languageCode)
    return groupWordsBySpeaker(words)
  } finally {
    await deleteAudioFile(audioPath)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId } = await params
  const supabase = createSupabaseServerClient()
  const episode = await getEpisode(supabase, episodeId)

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  if (
    episode.cantoContentStart === null ||
    episode.cantoContentEnd === null ||
    episode.englishContentStart === null ||
    episode.englishContentEnd === null
  ) {
    return NextResponse.json({ error: 'Episode anchors must be set before auto-marking' }, { status: 400 })
  }

  const anchors: EpisodeAnchors = {
    cantoContentStart: episode.cantoContentStart,
    cantoContentEnd: episode.cantoContentEnd,
    englishContentStart: episode.englishContentStart,
    englishContentEnd: episode.englishContentEnd,
  }

  let cantoTurns
  let englishTurns
  try {
    ;[cantoTurns, englishTurns] = await Promise.all([
      transcribeVideo(episode.cantoneseVideoId, 'yue-Hant-HK').catch((error) => {
        throw new Error(`Cantonese video (${episode.cantoneseVideoId}) failed: ${(error as Error).message}`)
      }),
      transcribeVideo(episode.englishVideoId, 'en-US').catch((error) => {
        throw new Error(`English video (${episode.englishVideoId}) failed: ${(error as Error).message}`)
      }),
    ])
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 })
  }

  const { segments: candidates, usedFallback } = pairDiarizedTurns(cantoTurns, englishTurns, anchors)
  const segments = await createSegmentsBulk(supabase, episodeId, candidates)

  return NextResponse.json(
    {
      segments,
      ...(usedFallback
        ? {
            warning: `Cantonese and English speaker-turn counts didn't match (${cantoTurns.length} vs ${englishTurns.length}); used proportional timing for English instead of direct alignment.`,
          }
        : {}),
    },
    { status: 201 }
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- 'auto-mark/route.test.ts'`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/app/api/dub-sync/episodes/\[episodeId\]/auto-mark
git commit -m "feat: add dub-sync auto-mark API route"
```

---

## Task 10: Admin page skeleton — episode switcher, add episode, anchors

**Files:**
- Create: `src/app/dub-sync/admin/page.tsx`
- Create: `src/app/dub-sync/admin/admin.tsx`
- Create: `src/app/dub-sync/admin/admin.test.tsx`
- Create: `src/app/dub-sync/admin/new-episode-form.tsx` (moved from `src/app/dub-sync/new-episode-form.tsx`, adapted)
- Create: `src/app/dub-sync/admin/new-episode-form.test.tsx` (moved, adapted)
- Delete: `src/app/dub-sync/new-episode-form.tsx`, `src/app/dub-sync/new-episode-form.test.tsx` (superseded — old location no longer used after Task 14 removes their only caller, but moving now keeps `admin.tsx` self-contained from the start)

**Interfaces:**
- Consumes: `readAdminSessionFromCookieValue`, `ADMIN_COOKIE_NAME` (Task 1), `listEpisodes`, `listSegments` (existing), `YoutubePlayer` (existing, `src/components/dub-sync/youtube-player.tsx`).
- Produces: the `/dub-sync/admin` route with episode switching, episode creation, and anchor marking. `Admin` component holds `episodes: DubEpisode[]`, `segmentsByEpisode: Record<string, DubSegment[]>`, `selectedEpisodeId: string | null` state — consumed and extended by Tasks 11-13.

- [ ] **Step 1: Write the failing test for the moved/adapted NewEpisodeForm**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewEpisodeForm } from './new-episode-form'

describe('NewEpisodeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            episode: {
              id: 'ep-1',
              title: 'Muddy Puddles',
              cantoneseVideoId: 'canto-123',
              englishVideoId: 'eng-456',
              cantoContentStart: null,
              cantoContentEnd: null,
              englishContentStart: null,
              englishContentEnd: null,
            },
          }),
      })
    )
  })

  it('submits the form and reports the new episode to its caller', async () => {
    const onCreated = vi.fn()
    render(<NewEpisodeForm onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Muddy Puddles' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'canto-123' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'eng-456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'ep-1' })))
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/episodes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Muddy Puddles', cantoneseVideoId: 'canto-123', englishVideoId: 'eng-456' }),
      })
    )
  })

  it('shows an error message when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<NewEpisodeForm onCreated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'a' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to create episode'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/dub-sync/admin/new-episode-form.test.tsx`
Expected: FAIL with "Cannot find module './new-episode-form'"

- [ ] **Step 3: Implement the adapted form**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import type { DubEpisode } from '@/lib/db/dub-sync'

interface NewEpisodeFormProps {
  onCreated: (episode: DubEpisode) => void
}

export function NewEpisodeForm({ onCreated }: NewEpisodeFormProps) {
  const [title, setTitle] = useState('')
  const [cantoneseVideoId, setCantoneseVideoId] = useState('')
  const [englishVideoId, setEnglishVideoId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const response = await fetch('/api/dub-sync/episodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, cantoneseVideoId, englishVideoId }),
    })

    setSubmitting(false)
    if (!response.ok) {
      setError('Failed to create episode')
      return
    }
    const { episode } = await response.json()
    setTitle('')
    setCantoneseVideoId('')
    setEnglishVideoId('')
    onCreated(episode)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 max-w-md" data-testid="new-episode-form">
      <label className="flex flex-col gap-1">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className="border p-2 rounded" />
      </label>
      <label className="flex flex-col gap-1">
        Cantonese video ID
        <input
          value={cantoneseVideoId}
          onChange={(e) => setCantoneseVideoId(e.target.value)}
          required
          className="border p-2 rounded"
        />
      </label>
      <label className="flex flex-col gap-1">
        English video ID
        <input
          value={englishVideoId}
          onChange={(e) => setEnglishVideoId(e.target.value)}
          required
          className="border p-2 rounded"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className="border p-2 rounded bg-gray-800 text-white">
        {submitting ? 'Adding…' : 'Add episode'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/dub-sync/admin/new-episode-form.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Delete the old form and its test**

```bash
rm src/app/dub-sync/new-episode-form.tsx src/app/dub-sync/new-episode-form.test.tsx
```

(`src/app/dub-sync/page.tsx` still imports the old path at this point in the plan — it's fixed in Task 14. Don't run the full suite yet; Step 9 below runs only the admin-page tests.)

- [ ] **Step 6: Write the failing test for the admin client component (episode switcher + anchors)**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/components/dub-sync/youtube-player', () => ({
  YoutubePlayer: vi.fn(({ elementId }: { elementId: string }) => <div data-testid={`player-${elementId}`} />),
}))

import { Admin } from './admin'
import { YoutubePlayer } from '@/components/dub-sync/youtube-player'

const episodeA = {
  id: 'ep-a',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-a',
  englishVideoId: 'eng-a',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}
const episodeB = {
  id: 'ep-b',
  title: 'The Playgroup',
  cantoneseVideoId: 'canto-b',
  englishVideoId: 'eng-b',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists episodes and switches the selected panel without navigating', () => {
    render(<Admin episodes={[episodeA, episodeB]} segmentsByEpisode={{ 'ep-a': [], 'ep-b': [] }} />)

    expect(screen.getByRole('heading', { name: 'Muddy Puddles' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'The Playgroup' }))

    expect(screen.getByRole('heading', { name: 'The Playgroup' })).toBeInTheDocument()
  })

  it('selects a newly created episode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeB, id: 'ep-c', title: 'New Episode' } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Episode' } })
    fireEvent.change(screen.getByLabelText('Cantonese video ID'), { target: { value: 'c' } })
    fireEvent.change(screen.getByLabelText('English video ID'), { target: { value: 'd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Episode' })).toBeInTheDocument())
  })

  it('marks the canto content start from the canto player and saves it', async () => {
    let capturedRef: React.Ref<unknown> | undefined
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId, ...props }: never) => {
      if (elementId === 'canto-player') capturedRef = (props as { ref?: React.Ref<unknown> }).ref
      return <div data-testid={`player-${elementId}`} />
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ episode: { ...episodeA, cantoContentStart: 8 } }),
    } as Response)

    render(<Admin episodes={[episodeA]} segmentsByEpisode={{ 'ep-a': [] }} />)

    if (capturedRef && typeof capturedRef === 'object' && 'current' in capturedRef) {
      ;(capturedRef as { current: unknown }).current = {
        seekTo: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        getCurrentTime: () => 8,
      }
    }

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark content start' })[0])

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/dub-sync/episodes/ep-a', expect.objectContaining({ method: 'PATCH' }))
    )
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL with "Cannot find module './admin'"

- [ ] **Step 8: Implement the admin client component**

```tsx
'use client'

import { useRef, useState } from 'react'
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/dub-sync/youtube-player'
import type { DubEpisode, DubSegment } from '@/lib/db/dub-sync'
import type { EpisodeAnchors } from '@/lib/dub-sync/normalize'
import { NewEpisodeForm } from './new-episode-form'

interface AdminProps {
  episodes: DubEpisode[]
  segmentsByEpisode: Record<string, DubSegment[]>
}

function hasAllAnchors(episode: DubEpisode): episode is DubEpisode & EpisodeAnchors {
  return (
    episode.cantoContentStart !== null &&
    episode.cantoContentEnd !== null &&
    episode.englishContentStart !== null &&
    episode.englishContentEnd !== null
  )
}

export function Admin({ episodes: initialEpisodes, segmentsByEpisode: initialSegments }: AdminProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [segmentsByEpisode, setSegmentsByEpisode] = useState(initialSegments)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodes[0]?.id ?? null)

  const cantoPlayerRef = useRef<YoutubePlayerHandle>(null)
  const englishPlayerRef = useRef<YoutubePlayerHandle>(null)

  const episode = episodes.find((candidate) => candidate.id === selectedEpisodeId) ?? null
  const segments = selectedEpisodeId ? (segmentsByEpisode[selectedEpisodeId] ?? []) : []

  function handleEpisodeCreated(newEpisode: DubEpisode) {
    setEpisodes((current) => [...current, newEpisode])
    setSegmentsByEpisode((current) => ({ ...current, [newEpisode.id]: [] }))
    setSelectedEpisodeId(newEpisode.id)
  }

  function updateEpisodeInPlace(updated: DubEpisode) {
    setEpisodes((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)))
  }

  async function saveAnchors(next: {
    cantoContentStart: number
    cantoContentEnd: number
    englishContentStart: number
    englishContentEnd: number
  }) {
    if (!episode) return
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (response.ok) {
      const { episode: updated } = await response.json()
      updateEpisodeInPlace(updated)
    }
  }

  function markCantoStart() {
    if (!episode) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: time,
      cantoContentEnd: episode.cantoContentEnd ?? time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markCantoEnd() {
    if (!episode) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: time,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markEnglishStart() {
    if (!episode) return
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: time,
      englishContentEnd: episode.englishContentEnd ?? 0,
    })
  }

  function markEnglishEnd() {
    if (!episode) return
    const time = englishPlayerRef.current?.getCurrentTime() ?? 0
    saveAnchors({
      cantoContentStart: episode.cantoContentStart ?? 0,
      cantoContentEnd: episode.cantoContentEnd ?? 0,
      englishContentStart: episode.englishContentStart ?? 0,
      englishContentEnd: time,
    })
  }

  const anchorsSet = episode ? hasAllAnchors(episode) : false

  return (
    <div className="flex gap-6 p-6">
      <aside className="w-64 flex flex-col gap-2">
        <h2 className="font-bold">Episodes</h2>
        <ul className="flex flex-col gap-1">
          {episodes.map((candidate) => (
            <li key={candidate.id}>
              <button
                onClick={() => setSelectedEpisodeId(candidate.id)}
                className={`text-left w-full p-1 rounded ${candidate.id === selectedEpisodeId ? 'bg-gray-200' : ''}`}
              >
                {candidate.title}
              </button>
            </li>
          ))}
        </ul>
        <NewEpisodeForm onCreated={handleEpisodeCreated} />
      </aside>

      <main className="flex-1">
        {!episode ? (
          <p className="text-gray-500">No episode selected.</p>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-4">{episode.title}</h1>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <YoutubePlayer ref={cantoPlayerRef} videoId={episode.cantoneseVideoId} elementId="canto-player" />
                <div className="flex gap-2 mt-2">
                  <button onClick={markCantoStart} className="border p-1 rounded">
                    Mark content start
                  </button>
                  <button onClick={markCantoEnd} className="border p-1 rounded">
                    Mark content end
                  </button>
                </div>
              </div>
              <div>
                <YoutubePlayer ref={englishPlayerRef} videoId={episode.englishVideoId} elementId="english-player" />
                <div className="flex gap-2 mt-2">
                  <button onClick={markEnglishStart} className="border p-1 rounded">
                    Mark content start
                  </button>
                  <button onClick={markEnglishEnd} className="border p-1 rounded">
                    Mark content end
                  </button>
                </div>
              </div>
            </div>
            {/* Segment table, manual add, and auto-mark controls are added in later tasks. */}
            {!anchorsSet && <p className="text-gray-500">Set anchors before marking segments.</p>}
            <p className="text-sm text-gray-500">{segments.length} segment(s)</p>
          </>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 9: Run the admin-page tests to verify they pass**

Run: `npm test -- src/app/dub-sync/admin`
Expected: PASS (5 tests across `new-episode-form.test.tsx` and `admin.test.tsx`)

- [ ] **Step 10: Add the gated server page**

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes, listSegments, type DubSegment } from '@/lib/db/dub-sync'
import { readAdminSessionFromCookieValue, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-session'
import { Admin } from './admin'

export default async function DubSyncAdminPage() {
  const cookieStore = await cookies()
  const session = await readAdminSessionFromCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  if (!session) {
    redirect('/dub-sync/login')
  }

  const supabase = createSupabaseServerClient()
  const episodes = await listEpisodes(supabase)

  const segmentsByEpisode: Record<string, DubSegment[]> = {}
  for (const episode of episodes) {
    segmentsByEpisode[episode.id] = await listSegments(supabase, episode.id)
  }

  return <Admin episodes={episodes} segmentsByEpisode={segmentsByEpisode} />
}
```

- [ ] **Step 11: Run the full suite and lint, then commit**

Note: `src/app/dub-sync/page.tsx` still imports the now-deleted `./new-episode-form` at this point, so `npm test` and `npm run lint` will fail on that file specifically — this is expected and resolved in Task 14. Run only the dub-sync admin/API scope for this commit:

Run: `npm test -- src/app/dub-sync/admin src/app/api/dub-sync src/lib/dub-sync src/lib/auth`
Expected: PASS

```bash
git add src/app/dub-sync/admin
git rm src/app/dub-sync/new-episode-form.tsx src/app/dub-sync/new-episode-form.test.tsx
git commit -m "feat: add dub-sync admin page skeleton with episode switcher and anchors"
```

---

## Task 11: Admin page — segment table

**Files:**
- Create: `src/app/dub-sync/admin/segment-table.tsx`
- Create: `src/app/dub-sync/admin/segment-table.test.tsx`
- Modify: `src/app/dub-sync/admin/admin.tsx`

**Interfaces:**
- Consumes: `DubSegment` (existing).
- Produces:
  ```ts
  export interface SegmentTableProps {
    episodeId: string
    segments: DubSegment[]
    onUpdate: (segment: DubSegment) => void
    onDelete: (segmentId: string) => void
  }
  export function SegmentTable(props: SegmentTableProps): JSX.Element
  ```
  Rendered by `admin.tsx`'s selected-episode panel; `onUpdate`/`onDelete` update `Admin`'s `segmentsByEpisode` state.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SegmentTable } from './segment-table'

const segment = {
  id: 'seg-1',
  episodeId: 'ep-1',
  position: 0,
  label: 'Hello',
  cantoStart: 10,
  cantoEnd: 14,
  englishStart: 20,
  englishEnd: 25,
}

describe('SegmentTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders one row per segment with its current values', () => {
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
    expect(screen.getByDisplayValue('14')).toBeInTheDocument()
  })

  it('saves a field on blur when its value changed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ segment: { ...segment, cantoEnd: 16 } }),
    } as Response)
    const onUpdate = vi.fn()
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={onUpdate} onDelete={vi.fn()} />)

    const cantoEndInput = screen.getByDisplayValue('14')
    fireEvent.change(cantoEndInput, { target: { value: '16' } })
    fireEvent.blur(cantoEndInput)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments/seg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cantoEnd: 16 }) })
      )
    )
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ ...segment, cantoEnd: 16 }))
  })

  it('does not save when a field is blurred unchanged', async () => {
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    const cantoEndInput = screen.getByDisplayValue('14')
    fireEvent.blur(cantoEndInput)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows an inline error and keeps the typed value when a save fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const onUpdate = vi.fn()
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={onUpdate} onDelete={vi.fn()} />)

    const cantoEndInput = screen.getByDisplayValue('14')
    fireEvent.change(cantoEndInput, { target: { value: '16' } })
    fireEvent.blur(cantoEndInput)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save'))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('16')).toBeInTheDocument()
  })

  it('deletes a segment', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
    const onDelete = vi.fn()
    render(<SegmentTable episodeId="ep-1" segments={[segment]} onUpdate={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-1/segments/seg-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    )
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('seg-1'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- segment-table.test.tsx`
Expected: FAIL with "Cannot find module './segment-table'"

- [ ] **Step 3: Implement**

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { DubSegment, UpdateSegmentInput } from '@/lib/db/dub-sync'

export interface SegmentTableProps {
  episodeId: string
  segments: DubSegment[]
  onUpdate: (segment: DubSegment) => void
  onDelete: (segmentId: string) => void
}

export function SegmentTable({ episodeId, segments, onUpdate, onDelete }: SegmentTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">Label</th>
          <th className="text-left">Canto start</th>
          <th className="text-left">Canto end</th>
          <th className="text-left">English start</th>
          <th className="text-left">English end</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {segments.map((segment) => (
          <SegmentRow
            key={segment.id}
            episodeId={episodeId}
            segment={segment}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  )
}

interface SegmentRowProps {
  episodeId: string
  segment: DubSegment
  onUpdate: (segment: DubSegment) => void
  onDelete: (segmentId: string) => void
}

function SegmentRow({ episodeId, segment, onUpdate, onDelete }: SegmentRowProps) {
  const [draft, setDraft] = useState(segment)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(segment)
  }, [segment])

  async function saveField<K extends keyof UpdateSegmentInput>(field: K) {
    if (draft[field] === segment[field]) return
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/segments/${segment.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: draft[field] }),
    })
    if (response.ok) {
      setSaveError(null)
      const { segment: updated } = await response.json()
      onUpdate(updated)
    } else {
      // Deliberately don't reset draft to the last-saved value here — the typed value stays
      // visible so the edit isn't lost, and the error makes clear it wasn't saved.
      setSaveError('Failed to save — try again')
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/dub-sync/episodes/${episodeId}/segments/${segment.id}`, { method: 'DELETE' })
    if (response.ok) onDelete(segment.id)
  }

  return (
    <tr>
      <td>
        <input
          value={draft.label ?? ''}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          onBlur={() => saveField('label')}
          className="border p-1 rounded w-full"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.cantoStart}
          onChange={(e) => setDraft({ ...draft, cantoStart: Number(e.target.value) })}
          onBlur={() => saveField('cantoStart')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.cantoEnd}
          onChange={(e) => setDraft({ ...draft, cantoEnd: Number(e.target.value) })}
          onBlur={() => saveField('cantoEnd')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.englishStart}
          onChange={(e) => setDraft({ ...draft, englishStart: Number(e.target.value) })}
          onBlur={() => saveField('englishStart')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.englishEnd}
          onChange={(e) => setDraft({ ...draft, englishEnd: Number(e.target.value) })}
          onBlur={() => saveField('englishEnd')}
          className="border p-1 rounded w-20"
        />
      </td>
      <td>
        <button onClick={handleDelete} className="border p-1 rounded text-sm">
          Delete
        </button>
        {saveError && (
          <p role="alert" className="text-red-600 text-xs mt-1">
            {saveError}
          </p>
        )}
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- segment-table.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire the table into admin.tsx**

In `src/app/dub-sync/admin/admin.tsx`, add the import and handlers, and replace the placeholder segment-count paragraph:

```tsx
import { SegmentTable } from './segment-table'
```

```tsx
  function handleSegmentUpdated(updated: DubSegment) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].map((s) => (s.id === updated.id ? updated : s)),
    }))
  }

  function handleSegmentDeleted(segmentId: string) {
    if (!selectedEpisodeId) return
    setSegmentsByEpisode((current) => ({
      ...current,
      [selectedEpisodeId]: current[selectedEpisodeId].filter((s) => s.id !== segmentId),
    }))
  }
```

Replace:

```tsx
            {!anchorsSet && <p className="text-gray-500">Set anchors before marking segments.</p>}
            <p className="text-sm text-gray-500">{segments.length} segment(s)</p>
```

with:

```tsx
            {!anchorsSet && <p className="text-gray-500 mb-4">Set anchors before marking segments.</p>}
            <SegmentTable
              episodeId={episode.id}
              segments={segments}
              onUpdate={handleSegmentUpdated}
              onDelete={handleSegmentDeleted}
            />
```

- [ ] **Step 6: Run the admin-page tests to verify nothing broke**

Run: `npm test -- src/app/dub-sync/admin`
Expected: PASS (10 tests)

- [ ] **Step 7: Run lint, then commit**

```bash
npm run lint
git add src/app/dub-sync/admin
git commit -m "feat: add inline-editable segment table to dub-sync admin page"
```

---

## Task 12: Admin page — manual segment add

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Modify: `src/app/dub-sync/admin/admin.test.tsx`

**Interfaces:**
- Consumes: `englishTimeFor` (existing, `src/lib/dub-sync/normalize.ts`).
- Produces: extends `Admin` with the "Mark start / Mark end / Save segment" flow (ported from the deleted editor), appending saved segments to `segmentsByEpisode`.

- [ ] **Step 1: Write the failing test**

Append to `src/app/dub-sync/admin/admin.test.tsx`:

```tsx
describe('Admin manual segment creation', () => {
  const episodeWithAnchors = {
    ...episodeA,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId }: { elementId: string }) => (
      <div data-testid={`player-${elementId}`} />
    ))
  })

  it('marks start then end and saves a segment', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          segment: {
            id: 'seg-1',
            episodeId: 'ep-a',
            position: 0,
            label: null,
            cantoStart: 20,
            cantoEnd: 30,
            englishStart: 40,
            englishEnd: 60,
          },
        }),
    } as Response)

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark start' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark end' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save segment' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/segments',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL — "Mark start" / "Mark end" / "Save segment" buttons don't exist yet

- [ ] **Step 3: Add the manual-add flow to admin.tsx**

Add the import and state/handlers:

```tsx
import { englishTimeFor, type EpisodeAnchors } from '@/lib/dub-sync/normalize'
```

(Note: `EpisodeAnchors` is already imported for `hasAllAnchors` — just add `englishTimeFor` to that existing import line.)

```tsx
  const [pendingSegment, setPendingSegment] = useState<{
    cantoStart: number
    cantoEnd: number | null
    englishStart: number
    englishEnd: number | null
  } | null>(null)

  function markSegmentStart() {
    if (!episode || !anchorsSet) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishStart = englishTimeFor(time, episode as DubEpisode & EpisodeAnchors)
    setPendingSegment({ cantoStart: time, cantoEnd: null, englishStart, englishEnd: null })
    englishPlayerRef.current?.seekTo(englishStart, true)
  }

  function markSegmentEnd() {
    if (!episode || !pendingSegment || !anchorsSet) return
    const time = cantoPlayerRef.current?.getCurrentTime() ?? 0
    const englishEnd = englishTimeFor(time, episode as DubEpisode & EpisodeAnchors)
    setPendingSegment({ ...pendingSegment, cantoEnd: time, englishEnd })
    englishPlayerRef.current?.seekTo(englishEnd, true)
  }

  async function saveSegment() {
    if (!episode || !pendingSegment || pendingSegment.cantoEnd === null || pendingSegment.englishEnd === null) return
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/segments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cantoStart: pendingSegment.cantoStart,
        cantoEnd: pendingSegment.cantoEnd,
        englishStart: pendingSegment.englishStart,
        englishEnd: pendingSegment.englishEnd,
      }),
    })
    if (response.ok) {
      const { segment } = await response.json()
      setSegmentsByEpisode((current) => ({
        ...current,
        [episode.id]: [...(current[episode.id] ?? []), segment],
      }))
      setPendingSegment(null)
    }
  }
```

Add the controls just above the `<SegmentTable ...>` element:

```tsx
            <div className="flex gap-2 mb-4">
              <button onClick={markSegmentStart} disabled={!anchorsSet} className="border p-2 rounded">
                Mark start
              </button>
              <button
                onClick={markSegmentEnd}
                disabled={!anchorsSet || !pendingSegment}
                className="border p-2 rounded"
              >
                Mark end
              </button>
              <button
                onClick={saveSegment}
                disabled={!pendingSegment || pendingSegment.cantoEnd === null}
                className="border p-2 rounded"
              >
                Save segment
              </button>
            </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/dub-sync/admin/admin.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Run the full admin/API/lib scope and lint, then commit**

```bash
npm test -- src/app/dub-sync/admin src/app/api/dub-sync src/lib/dub-sync src/lib/auth
npm run lint
git add src/app/dub-sync/admin
git commit -m "feat: add manual segment creation to dub-sync admin page"
```

---

## Task 13: Admin page — auto-mark and generate-from-captions buttons

**Files:**
- Modify: `src/app/dub-sync/admin/admin.tsx`
- Modify: `src/app/dub-sync/admin/admin.test.tsx`

**Interfaces:**
- Consumes: `POST /api/dub-sync/episodes/[episodeId]/auto-mark` (Task 9), `POST /api/dub-sync/episodes/[episodeId]/generate-segments` (existing).
- Produces: two buttons in the selected episode's panel, both disabled until anchors are set, both appending returned segments to `segmentsByEpisode`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/dub-sync/admin/admin.test.tsx`:

```tsx
describe('Admin auto-mark and generate from captions', () => {
  const episodeWithAnchors = {
    ...episodeA,
    cantoContentStart: 10,
    cantoContentEnd: 110,
    englishContentStart: 20,
    englishContentEnd: 220,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(YoutubePlayer).mockImplementation(({ elementId }: { elementId: string }) => (
      <div data-testid={`player-${elementId}`} />
    ))
  })

  it('runs auto-mark, shows a working state, and appends returned segments', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-mark from speech' }))

    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()

    resolveFetch({
      ok: true,
      json: () =>
        Promise.resolve({
          segments: [
            { id: 'seg-1', episodeId: 'ep-a', position: 0, label: null, cantoStart: 10, cantoEnd: 15, englishStart: 20, englishEnd: 26 },
          ],
        }),
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Auto-mark from speech' })).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/dub-sync/episodes/ep-a/auto-mark',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('shows a warning (not an error) when auto-mark falls back to proportional timing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ segments: [], warning: "turn counts didn't match (3 vs 2)" }),
      })
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-mark from speech' }))

    await waitFor(() => expect(screen.getByText(/turn counts didn't match/)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error when auto-mark fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'yt-dlp not found' }) })
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-mark from speech' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('yt-dlp not found'))
  })

  it('runs generate from captions and appends returned segments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            segments: [
              { id: 'seg-2', episodeId: 'ep-a', position: 0, label: null, cantoStart: 10, cantoEnd: 15, englishStart: 20, englishEnd: 26 },
            ],
          }),
      })
    )

    render(<Admin episodes={[episodeWithAnchors]} segmentsByEpisode={{ 'ep-a': [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate from captions' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/dub-sync/episodes/ep-a/generate-segments',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/dub-sync/admin/admin.test.tsx`
Expected: FAIL — buttons don't exist yet

- [ ] **Step 3: Add the buttons and handlers to admin.tsx**

```tsx
  const [autoMarkState, setAutoMarkState] = useState<{ working: boolean; error: string | null; warning: string | null }>({
    working: false,
    error: null,
    warning: null,
  })

  async function runAutoMark() {
    if (!episode) return
    setAutoMarkState({ working: true, error: null, warning: null })
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/auto-mark`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setAutoMarkState({ working: false, error: body.error ?? 'Failed to auto-mark segments', warning: null })
      return
    }
    setSegmentsByEpisode((current) => ({
      ...current,
      [episode.id]: [...(current[episode.id] ?? []), ...body.segments],
    }))
    setAutoMarkState({ working: false, error: null, warning: body.warning ?? null })
  }

  const [captionsError, setCaptionsError] = useState<string | null>(null)

  async function runGenerateFromCaptions() {
    if (!episode) return
    setCaptionsError(null)
    const response = await fetch(`/api/dub-sync/episodes/${episode.id}/generate-segments`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setCaptionsError(body.error ?? 'Failed to generate segments')
      return
    }
    setSegmentsByEpisode((current) => ({
      ...current,
      [episode.id]: [...(current[episode.id] ?? []), ...body.segments],
    }))
  }
```

Add the buttons and messages, just after the manual-add controls `<div>` and before `<SegmentTable ...>`:

```tsx
            <div className="flex gap-2 mb-4">
              <button onClick={runAutoMark} disabled={!anchorsSet || autoMarkState.working} className="border p-2 rounded">
                {autoMarkState.working ? 'Working…' : 'Auto-mark from speech'}
              </button>
              <button onClick={runGenerateFromCaptions} disabled={!anchorsSet} className="border p-2 rounded">
                Generate from captions
              </button>
            </div>

            {autoMarkState.error && (
              <p role="alert" className="text-red-600 mb-4">
                {autoMarkState.error}
              </p>
            )}
            {autoMarkState.warning && <p className="text-amber-600 mb-4">{autoMarkState.warning}</p>}
            {captionsError && (
              <p role="alert" className="text-red-600 mb-4">
                {captionsError}
              </p>
            )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/dub-sync/admin/admin.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full admin/API/lib scope and lint, then commit**

```bash
npm test -- src/app/dub-sync/admin src/app/api/dub-sync src/lib/dub-sync src/lib/auth
npm run lint
git add src/app/dub-sync/admin
git commit -m "feat: wire auto-mark and generate-from-captions into dub-sync admin page"
```

---

## Task 14: Remove the old editor, simplify the episode list

**Files:**
- Delete: `src/app/dub-sync/[episodeId]/editor/` (entire directory: `page.tsx`, `editor.tsx`, `editor.test.tsx`)
- Modify: `src/app/dub-sync/page.tsx`

**Interfaces:** none new — this removes dead code and fixes the now-broken import left over from Task 10.

- [ ] **Step 1: Delete the old editor**

```bash
rm -rf src/app/dub-sync/\[episodeId\]/editor
```

- [ ] **Step 2: Simplify the episode list page**

```tsx
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { listEpisodes } from '@/lib/db/dub-sync'

export default async function DubSyncPage() {
  const supabase = createSupabaseServerClient()
  const episodes = await listEpisodes(supabase)

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Dub Sync</h1>
      <ul className="flex flex-col gap-2">
        {episodes.map((episode) => (
          <li key={episode.id}>
            <Link href={`/dub-sync/${episode.id}`} className="underline">
              {episode.title}
            </Link>
          </li>
        ))}
        {episodes.length === 0 && <li className="text-gray-500">No episodes yet.</li>}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: Run the full test suite to verify nothing references the deleted editor or old form path**

Run: `npm test`
Expected: PASS (all tests — the deleted editor's tests are gone with it, and `page.tsx` no longer imports the moved `new-episode-form`)

- [ ] **Step 4: Run lint, then commit**

```bash
npm run lint
git add -A src/app/dub-sync
git commit -m "refactor: remove dub-sync editor page, simplify episode list to a plain link list"
```

---

## Task 15: README documentation

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add a Dub Sync section**

Append to `README.md`, after the existing "Using your own recorded audio instead of AI-generated speech" section:

```markdown
## Dub Sync admin tool

A separate, password-gated personal tool at `/dub-sync/admin` for building the Cantonese/English clip-pairing data used by `/dub-sync`. Requires two things beyond the main app's setup:

- **`DUB_SYNC_ADMIN_PASSWORD`** in `.env.local` — the single shared password for `/dub-sync/admin`, `/dub-sync/login`, and the episode/segment-editing API routes. The player at `/dub-sync/<episodeId>` itself stays open, unauthenticated.
- **[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)** installed and on `PATH` wherever `npm run dev` (or however the app is served) runs — required by the "Auto-mark from speech" button, which downloads each video's audio temporarily (never kept or served) to transcribe it via Google Cloud Speech-to-Text with speaker diarization. Also requires the Speech-to-Text API enabled on the same `GOOGLE_CLOUD_PROJECT` already used for text-to-speech.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document dub-sync admin setup requirements"
```

---

## Task 16: Manual QA sweep

**Files:** none (verification only)

**Interfaces:** none — this task exercises the full stack built in Tasks 1-15 against real data.

- [ ] **Step 1: Confirm prerequisites**

Confirm `DUB_SYNC_ADMIN_PASSWORD` and `SESSION_SECRET` are set in `.env.local`, and that `yt-dlp` is installed (`yt-dlp --version` succeeds). Confirm the Speech-to-Text API is enabled on the `GOOGLE_CLOUD_PROJECT` used elsewhere in this repo.

- [ ] **Step 2: Start the dev server and confirm the gate**

Run `npm run dev`. Using `claude-in-chrome`, navigate to `/dub-sync/admin` and confirm it redirects to `/dub-sync/login`. Log in with the wrong password and confirm the inline error. Log in with the correct password and confirm it lands on `/dub-sync/admin`.

- [ ] **Step 3: Exercise the admin page**

Select an existing episode (or add one). Confirm switching between episodes in the sidebar updates the panel without a page navigation. Re-mark anchors if needed.

- [ ] **Step 4: Run auto-mark against a real episode**

Click "Auto-mark from speech." Confirm the button shows "Working…" and is disabled during the request. Once it completes, confirm segments appear in the table with plausible timings, and check whether a fallback warning appeared (expected if the Cantonese/English turn counts didn't match). Confirm no errors appear in the browser console (`read_console_messages`).

- [ ] **Step 5: Edit the generated data**

Change a segment's start/end time inline in the table and confirm it saves without needing a page refresh (re-select and re-select the episode, or reload, to confirm persistence). Delete a segment and confirm it disappears.

- [ ] **Step 6: Confirm the player still works unauthenticated**

In a fresh/incognito-style tab (or after logging out via `POST /api/dub-sync/logout`), navigate directly to `/dub-sync/<episodeId>` and confirm it loads and plays without any login prompt.

- [ ] **Step 7: Report results**

Summarize what worked, any fallback warnings seen, transcription accuracy observations, and any follow-up fixes needed. This is the final task — no commit unless a QA-driven fix was required, in which case fix, test, and commit following the same conventions as the tasks above.
