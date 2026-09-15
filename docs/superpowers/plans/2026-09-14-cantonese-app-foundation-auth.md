# Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js/TypeScript project skeleton with a working username/PIN signup, login, and logout flow backed by Supabase, deployed to Vercel with CI and auto-deploy on merge to `main`.

**Architecture:** A single Next.js (App Router) app in TypeScript. React components render pages; Next.js API route handlers (deployed as Vercel serverless functions) implement signup/login/logout. Supabase Postgres stores kid accounts via a service-role server client (never exposed to the browser). Sessions are a signed, encrypted cookie sealed with `iron-session`, read/written directly through `NextRequest`/`NextResponse` so route handlers are testable without a running server.

**Tech Stack:** Next.js 14.2.18, React 18.3.1, TypeScript 5.7.2, @supabase/supabase-js 2.47.10, bcryptjs 2.4.3, iron-session 8.0.4, Vitest 2.1.8, @testing-library/react 16.1.0, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-14-cantonese-kids-app-design.md`

## Global Constraints

- No email or other PII is ever collected — accounts are username + 4-digit PIN only.
- PINs are hashed with bcrypt before storage and never logged or stored in plaintext.
- Usernames are globally unique (case-insensitive) and checked against a blocklist filter at signup.
- Sessions are long-lived (30+ days) per device; there is no automated PIN recovery flow.
- Login is rate-limited: an account locks out for a period after repeated failed PIN attempts.
- The Supabase service-role key is used only in server-side code (API routes, `src/lib/db`, `src/lib/supabase`) and must never be imported into client components or the browser bundle.
- Every merge to `main` auto-deploys to Vercel; every branch/PR gets an automatic Vercel preview deploy.
- All application code is TypeScript.

---

## Task 1: Project Scaffold (Next.js, TypeScript, Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.mjs`
- Create: `.eslintrc.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Test: `src/app/page.test.tsx`

**Interfaces:**
- Produces: the `@/*` import alias resolving to `src/*` (used by every later task), and the `npm test` / `npm run lint` / `npm run dev` / `npm run build` scripts.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "canto",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "14.2.18",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "@supabase/supabase-js": "2.47.10",
    "bcryptjs": "2.4.3",
    "iron-session": "8.0.4"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "@types/node": "22.10.2",
    "@types/react": "18.3.18",
    "@types/react-dom": "18.3.5",
    "@types/bcryptjs": "2.4.6",
    "eslint": "8.57.1",
    "eslint-config-next": "14.2.18",
    "vitest": "2.1.8",
    "@vitejs/plugin-react": "4.3.4",
    "@testing-library/react": "16.1.0",
    "@testing-library/jest-dom": "6.6.3",
    "jsdom": "25.0.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {}

export default nextConfig
```

- [ ] **Step 5: Create `.eslintrc.json`**

```json
{
  "extends": "next/core-web-vitals"
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
.next
.env*.local
.vercel
coverage
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

- [ ] **Step 8: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 9: Create `src/app/layout.tsx`**

```tsx
export const metadata = {
  title: 'Canto',
  description: 'Learn Cantonese through play',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 10: Write the failing smoke test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HomePage from './page'

describe('HomePage', () => {
  it('renders the app name', () => {
    render(<HomePage />)
    expect(screen.getByText('Canto')).toBeInTheDocument()
  })
})
```

- [ ] **Step 11: Install dependencies and run the test to verify it fails**

Run: `npm install && npm test`
Expected: FAIL — `src/app/page.tsx` does not exist yet.

- [ ] **Step 12: Create `src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Canto</h1>
      <p>Learn Cantonese through play.</p>
    </main>
  )
}
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add package.json tsconfig.json next-env.d.ts next.config.mjs .eslintrc.json .gitignore vitest.config.ts vitest.setup.ts src/app/layout.tsx src/app/page.tsx src/app/page.test.tsx package-lock.json
git commit -m "chore: scaffold Next.js/TypeScript project with Vitest"
```

---

## Task 2: Supabase Setup — Kids Table, Server Client, Repository

**Files:**
- Create: `supabase/migrations/0001_create_kids.sql`
- Create: `.env.local.example`
- Create: `src/lib/supabase/client.ts`
- Test: `src/lib/supabase/client.test.ts`
- Create: `src/lib/db/kids.ts`
- Test: `src/lib/db/kids.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks besides the `@/*` alias.
- Produces: `createSupabaseServerClient(): SupabaseClient` from `@/lib/supabase/client`; `Kid` type, `findKidByUsername(supabase, username): Promise<Kid | null>`, `createKid(supabase, username, pinHash): Promise<{id: string; username: string}>`, `recordFailedLogin(supabase, kidId, failedAttempts, lockedUntil): Promise<void>`, `resetFailedLogins(supabase, kidId): Promise<void>` from `@/lib/db/kids` — all consumed by Tasks 6 and 7.

**Manual setup required first (not code):**

1. Go to supabase.com and create a free account, then create a new project. Save the database password somewhere safe (this is unrelated to any kid's PIN).
2. Open the SQL Editor in the new project. You'll run the migration from Step 1 below there once it's written.
3. In Project Settings → API, copy the **Project URL** and the **`service_role`** secret key (not the `anon` key — the service role key is required because the `kids` table has no public read/write policies).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0001_create_kids.sql`:

```sql
create extension if not exists pgcrypto;

create table kids (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  pin_hash text not null,
  avatar_id text not null default 'default',
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create unique index kids_username_lower_idx on kids ((lower(username)));

alter table kids enable row level security;
```

Run this file's contents in the Supabase SQL Editor against your project.

- [ ] **Step 2: Create `.env.local.example`**

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
```

Copy this to `.env.local` (already gitignored) and fill in your Supabase Project URL and service role key. Generate `SESSION_SECRET` with `openssl rand -base64 32`.

- [ ] **Step 3: Write the failing test for the Supabase client wrapper**

Create `src/lib/supabase/client.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { createSupabaseServerClient } from './client'

describe('createSupabaseServerClient', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  })

  it('throws when environment variables are missing', () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => createSupabaseServerClient()).toThrow(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    )
  })

  it('creates a client when environment variables are present', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    expect(() => createSupabaseServerClient()).not.toThrow()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — `./client` does not exist.

- [ ] **Step 5: Implement `src/lib/supabase/client.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 7: Write the failing tests for the kids repository**

Create `src/lib/db/kids.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findKidByUsername, createKid } from './kids'

function makeSupabaseMock(overrides: {
  maybeSingleResult?: { data: unknown; error: unknown }
  singleResult?: { data: unknown; error: unknown }
}): SupabaseClient {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue(overrides.maybeSingleResult ?? { data: null, error: null })
  const single = vi.fn().mockResolvedValue(overrides.singleResult ?? { data: null, error: null })
  const ilike = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ ilike, single })
  const insert = vi.fn().mockReturnValue({ select })
  const from = vi.fn().mockReturnValue({ select, insert })
  return { from } as unknown as SupabaseClient
}

describe('findKidByUsername', () => {
  it('returns the kid when found', async () => {
    const supabase = makeSupabaseMock({
      maybeSingleResult: {
        data: { id: '1', username: 'mimi', pin_hash: 'hash', failed_login_attempts: 0, locked_until: null },
        error: null,
      },
    })
    const kid = await findKidByUsername(supabase, 'mimi')
    expect(kid?.username).toBe('mimi')
  })

  it('returns null when not found', async () => {
    const supabase = makeSupabaseMock({ maybeSingleResult: { data: null, error: null } })
    const kid = await findKidByUsername(supabase, 'nobody')
    expect(kid).toBeNull()
  })

  it('throws when the query errors', async () => {
    const supabase = makeSupabaseMock({
      maybeSingleResult: { data: null, error: { message: 'boom' } },
    })
    await expect(findKidByUsername(supabase, 'mimi')).rejects.toThrow('Failed to look up kid: boom')
  })
})

describe('createKid', () => {
  it('returns the created kid', async () => {
    const supabase = makeSupabaseMock({
      singleResult: { data: { id: '2', username: 'kobe' }, error: null },
    })
    const kid = await createKid(supabase, 'kobe', 'hash')
    expect(kid).toEqual({ id: '2', username: 'kobe' })
  })

  it('throws when insert fails', async () => {
    const supabase = makeSupabaseMock({ singleResult: { data: null, error: { message: 'dup' } } })
    await expect(createKid(supabase, 'kobe', 'hash')).rejects.toThrow('Failed to create kid: dup')
  })
})
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `npm test -- kids.test.ts`
Expected: FAIL — `./kids` does not exist.

- [ ] **Step 9: Implement `src/lib/db/kids.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Kid {
  id: string
  username: string
  pin_hash: string
  failed_login_attempts: number
  locked_until: string | null
}

export async function findKidByUsername(
  supabase: SupabaseClient,
  username: string
): Promise<Kid | null> {
  const { data, error } = await supabase
    .from('kids')
    .select('id, username, pin_hash, failed_login_attempts, locked_until')
    .ilike('username', username)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to look up kid: ${error.message}`)
  }
  return data as Kid | null
}

export async function createKid(
  supabase: SupabaseClient,
  username: string,
  pinHash: string
): Promise<{ id: string; username: string }> {
  const { data, error } = await supabase
    .from('kids')
    .insert({ username, pin_hash: pinHash })
    .select('id, username')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create kid: ${error?.message ?? 'unknown error'}`)
  }
  return data as { id: string; username: string }
}

export async function recordFailedLogin(
  supabase: SupabaseClient,
  kidId: string,
  failedAttempts: number,
  lockedUntil: string | null
): Promise<void> {
  await supabase
    .from('kids')
    .update({ failed_login_attempts: failedAttempts, locked_until: lockedUntil })
    .eq('id', kidId)
}

export async function resetFailedLogins(supabase: SupabaseClient, kidId: string): Promise<void> {
  await supabase.from('kids').update({ failed_login_attempts: 0, locked_until: null }).eq('id', kidId)
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm test -- kids.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0001_create_kids.sql .env.local.example src/lib/supabase/client.ts src/lib/supabase/client.test.ts src/lib/db/kids.ts src/lib/db/kids.test.ts
git commit -m "feat: add Supabase kids table, server client, and repository"
```

*(`.env.local` itself is gitignored and must not be committed.)*

---

## Task 3: PIN Hashing Utility

**Files:**
- Create: `src/lib/auth/pin.ts`
- Test: `src/lib/auth/pin.test.ts`

**Interfaces:**
- Produces: `isValidPinFormat(pin: string): boolean`, `hashPin(pin: string): Promise<string>`, `verifyPin(pin: string, hash: string): Promise<boolean>` from `@/lib/auth/pin` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/pin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, isValidPinFormat } from './pin'

describe('isValidPinFormat', () => {
  it('accepts a 4-digit string', () => {
    expect(isValidPinFormat('1234')).toBe(true)
  })

  it('rejects non-4-digit input', () => {
    expect(isValidPinFormat('123')).toBe(false)
    expect(isValidPinFormat('12345')).toBe(false)
    expect(isValidPinFormat('abcd')).toBe(false)
  })
})

describe('hashPin / verifyPin', () => {
  it('produces a hash that verifies against the original PIN', async () => {
    const hash = await hashPin('4821')
    expect(await verifyPin('4821', hash)).toBe(true)
  })

  it('rejects an incorrect PIN', async () => {
    const hash = await hashPin('4821')
    expect(await verifyPin('9999', hash)).toBe(false)
  })

  it('throws for a malformed PIN', async () => {
    await expect(hashPin('12')).rejects.toThrow('PIN must be exactly 4 digits')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- pin.test.ts`
Expected: FAIL — `./pin` does not exist.

- [ ] **Step 3: Implement `src/lib/auth/pin.ts`**

```ts
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10
const PIN_PATTERN = /^\d{4}$/

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin)
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be exactly 4 digits')
  }
  return bcrypt.hash(pin, SALT_ROUNDS)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- pin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/pin.ts src/lib/auth/pin.test.ts
git commit -m "feat: add PIN hashing and verification utility"
```

---

## Task 4: Username Validation & Blocklist

**Files:**
- Create: `src/lib/auth/blocklist.ts`
- Create: `src/lib/auth/username.ts`
- Test: `src/lib/auth/username.test.ts`

**Interfaces:**
- Produces: `isValidUsernameFormat(username: string): boolean`, `containsBlockedWord(username: string): boolean`, `validateUsername(username: string): { valid: boolean; reason?: string }` from `@/lib/auth/username` — consumed by Task 6.

- [ ] **Step 1: Create the blocklist**

Create `src/lib/auth/blocklist.ts`:

```ts
// Minimal starter list for the MVP; expand as needed before wider launch.
export const USERNAME_BLOCKLIST = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'nigger',
  'cunt',
  'dick',
  'pussy',
  'sex',
  'porn',
]
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/auth/username.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isValidUsernameFormat, containsBlockedWord, validateUsername } from './username'

describe('isValidUsernameFormat', () => {
  it('accepts 3-16 letters, numbers, and underscores', () => {
    expect(isValidUsernameFormat('mimi_4')).toBe(true)
  })

  it('rejects usernames that are too short', () => {
    expect(isValidUsernameFormat('ab')).toBe(false)
  })

  it('rejects usernames that are too long', () => {
    expect(isValidUsernameFormat('a'.repeat(17))).toBe(false)
  })

  it('rejects spaces and special characters', () => {
    expect(isValidUsernameFormat('mimi mimi')).toBe(false)
    expect(isValidUsernameFormat('mimi!')).toBe(false)
  })
})

describe('containsBlockedWord', () => {
  it('detects a blocked word regardless of case', () => {
    expect(containsBlockedWord('SHITkid')).toBe(true)
  })

  it('allows clean usernames', () => {
    expect(containsBlockedWord('mimi_4')).toBe(false)
  })
})

describe('validateUsername', () => {
  it('accepts a valid, clean username', () => {
    expect(validateUsername('mimi_4')).toEqual({ valid: true })
  })

  it('rejects a badly formatted username with a reason', () => {
    expect(validateUsername('ab')).toEqual({
      valid: false,
      reason: 'Username must be 3-16 letters, numbers, or underscores',
    })
  })

  it('rejects a blocked username with a reason', () => {
    expect(validateUsername('shitkid')).toEqual({ valid: false, reason: 'Username is not allowed' })
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- username.test.ts`
Expected: FAIL — `./username` does not exist.

- [ ] **Step 4: Implement `src/lib/auth/username.ts`**

```ts
import { USERNAME_BLOCKLIST } from './blocklist'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_PATTERN.test(username)
}

export function containsBlockedWord(username: string): boolean {
  const normalized = username.toLowerCase()
  return USERNAME_BLOCKLIST.some((word) => normalized.includes(word))
}

export function validateUsername(username: string): { valid: boolean; reason?: string } {
  if (!isValidUsernameFormat(username)) {
    return { valid: false, reason: 'Username must be 3-16 letters, numbers, or underscores' }
  }
  if (containsBlockedWord(username)) {
    return { valid: false, reason: 'Username is not allowed' }
  }
  return { valid: true }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- username.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/blocklist.ts src/lib/auth/username.ts src/lib/auth/username.test.ts
git commit -m "feat: add username format validation and blocklist filter"
```

---

## Task 5: Session Cookie Utilities

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Produces: `SessionData` type (`{ kidId: string; username: string }`), `COOKIE_NAME` constant, `createSessionCookieValue(data: SessionData): Promise<string>`, `readSession(request: NextRequest): Promise<SessionData | null>`, `readSessionFromCookieValue(cookie: string | undefined): Promise<SessionData | null>`, `setSessionCookie(response: NextResponse, value: string): void`, `clearSessionCookie(response: NextResponse): void` from `@/lib/auth/session` — consumed by Tasks 6, 7, 8, and 10.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  createSessionCookieValue,
  readSession,
  setSessionCookie,
  clearSessionCookie,
  COOKIE_NAME,
} from './session'

describe('session', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('round-trips session data through a cookie', async () => {
    const value = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })

    const response = NextResponse.next()
    setSessionCookie(response, value)
    const cookieValue = response.cookies.get(COOKIE_NAME)?.value
    expect(cookieValue).toBeDefined()

    const request = new NextRequest('http://localhost/api/whoami', {
      headers: { cookie: `${COOKIE_NAME}=${cookieValue}` },
    })
    const session = await readSession(request)
    expect(session).toEqual({ kidId: 'kid-1', username: 'mimi' })
  })

  it('returns null when no cookie is present', async () => {
    const request = new NextRequest('http://localhost/api/whoami')
    expect(await readSession(request)).toBeNull()
  })

  it('clears the cookie', () => {
    const response = NextResponse.next()
    clearSessionCookie(response)
    expect(response.cookies.get(COOKIE_NAME)?.value).toBe('')
  })

  it('throws when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET
    await expect(createSessionCookieValue({ kidId: 'x', username: 'y' })).rejects.toThrow(
      'SESSION_SECRET must be set'
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- session.test.ts`
Expected: FAIL — `./session` does not exist.

- [ ] **Step 3: Implement `src/lib/auth/session.ts`**

```ts
import { sealData, unsealData } from 'iron-session'
import type { NextRequest, NextResponse } from 'next/server'

export interface SessionData {
  kidId: string
  username: string
}

export const COOKIE_NAME = 'canto_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

function getSessionPassword(): string {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set to a string of at least 32 characters')
  }
  return password
}

export async function createSessionCookieValue(data: SessionData): Promise<string> {
  return sealData(data, { password: getSessionPassword() })
}

export async function readSessionFromCookieValue(
  cookie: string | undefined
): Promise<SessionData | null> {
  if (!cookie) return null
  try {
    return await unsealData<SessionData>(cookie, { password: getSessionPassword() })
  } catch {
    return null
  }
}

export async function readSession(request: NextRequest): Promise<SessionData | null> {
  return readSessionFromCookieValue(request.cookies.get(COOKIE_NAME)?.value)
}

export function setSessionCookie(response: NextResponse, value: string): void {
  response.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: add sealed-cookie session utilities"
```

---

## Task 6: Signup — API Route and Page

**Files:**
- Create: `src/app/api/signup/route.ts`
- Test: `src/app/api/signup/route.test.ts`
- Create: `src/app/signup/page.tsx`
- Test: `src/app/signup/page.test.tsx`

**Interfaces:**
- Consumes: `validateUsername` (`@/lib/auth/username`), `isValidPinFormat`, `hashPin` (`@/lib/auth/pin`), `findKidByUsername`, `createKid` (`@/lib/db/kids`), `createSessionCookieValue`, `setSessionCookie` (`@/lib/auth/session`), `createSupabaseServerClient` (`@/lib/supabase/client`).
- Produces: `POST /api/signup` accepting `{ username: string; pin: string }`, returning `201 { id, username }` with a session cookie set, or `400`/`409` with `{ error: string }`.

- [ ] **Step 1: Write the failing API route tests**

Create `src/app/api/signup/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/kids', () => ({
  findKidByUsername: vi.fn(),
  createKid: vi.fn(),
}))

import { POST } from './route'
import { findKidByUsername, createKid } from '@/lib/db/kids'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/signup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('creates a kid and sets a session cookie', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue(null)
    vi.mocked(createKid).mockResolvedValue({ id: 'kid-1', username: 'mimi' })

    const response = await POST(makeRequest({ username: 'mimi', pin: '1234' }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 'kid-1', username: 'mimi' })
    expect(response.cookies.get(COOKIE_NAME)).toBeDefined()
  })

  it('rejects a duplicate username', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'existing',
      username: 'mimi',
      pin_hash: 'x',
      failed_login_attempts: 0,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '1234' }))
    expect(response.status).toBe(409)
  })

  it('rejects an invalid PIN format', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue(null)
    const response = await POST(makeRequest({ username: 'mimi', pin: '12' }))
    expect(response.status).toBe(400)
  })

  it('rejects an invalid username', async () => {
    const response = await POST(makeRequest({ username: 'ab', pin: '1234' }))
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/api/signup`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement `src/app/api/signup/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { hashPin, isValidPinFormat } from '@/lib/auth/pin'
import { validateUsername } from '@/lib/auth/username'
import { findKidByUsername, createKid } from '@/lib/db/kids'
import { createSessionCookieValue, setSessionCookie } from '@/lib/auth/session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''

  const usernameCheck = validateUsername(username)
  if (!usernameCheck.valid) {
    return NextResponse.json({ error: usernameCheck.reason }, { status: 400 })
  }
  if (!isValidPinFormat(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()

  const existing = await findKidByUsername(supabase, username)
  if (existing) {
    return NextResponse.json({ error: 'That username is taken' }, { status: 409 })
  }

  const pinHash = await hashPin(pin)
  const created = await createKid(supabase, username, pinHash)

  const cookieValue = await createSessionCookieValue({ kidId: created.id, username: created.username })
  const response = NextResponse.json({ id: created.id, username: created.username }, { status: 201 })
  setSessionCookie(response, cookieValue)
  return response
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/api/signup`
Expected: PASS

- [ ] **Step 5: Write the failing page test**

Create `src/app/signup/page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import SignupPage from './page'

describe('SignupPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
    refreshMock.mockClear()
    global.fetch = vi.fn()
  })

  it('submits the form and redirects on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', username: 'mimi' }),
    } as Response)

    render(<SignupPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'))
  })

  it('shows an error message when signup fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'That username is taken' }),
    } as Response)

    render(<SignupPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken')
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- signup/page.test.tsx`
Expected: FAIL — `./page` does not exist.

- [ ] **Step 7: Implement `src/app/signup/page.tsx`**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, pin }),
    })

    setSubmitting(false)

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Something went wrong' }))
      setError(body.error ?? 'Something went wrong')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main>
      <h1>Create your account</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="username">Username</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="pin">4-digit PIN</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create account'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- signup/page.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/api/signup/route.ts src/app/api/signup/route.test.ts src/app/signup/page.tsx src/app/signup/page.test.tsx
git commit -m "feat: add signup API route and page"
```

---

## Task 7: Login — API Route with Rate Limiting, and Page

**Files:**
- Create: `src/app/api/login/route.ts`
- Test: `src/app/api/login/route.test.ts`
- Create: `src/app/login/page.tsx`
- Test: `src/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `verifyPin` (`@/lib/auth/pin`), `findKidByUsername`, `recordFailedLogin`, `resetFailedLogins` (`@/lib/db/kids`), `createSessionCookieValue`, `setSessionCookie` (`@/lib/auth/session`), `createSupabaseServerClient` (`@/lib/supabase/client`).
- Produces: `POST /api/login` accepting `{ username: string; pin: string }`, returning `200 { id, username }` with a session cookie on success, `401` on bad credentials, `429` while locked out.

- [ ] **Step 1: Write the failing API route tests**

Create `src/app/api/login/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { hashPin } from '@/lib/auth/pin'
import { COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/kids', () => ({
  findKidByUsername: vi.fn(),
  recordFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
}))

import { POST } from './route'
import { findKidByUsername, recordFailedLogin, resetFailedLogins } from '@/lib/db/kids'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = 'a'.repeat(32)
  })

  it('logs in with the correct PIN and resets failed attempts', async () => {
    const pinHash = await hashPin('4821')
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 2,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '4821' }))

    expect(response.status).toBe(200)
    expect(resetFailedLogins).toHaveBeenCalledWith(expect.anything(), 'kid-1')
    expect(response.cookies.get(COOKIE_NAME)).toBeDefined()
  })

  it('rejects an incorrect PIN and records the failed attempt', async () => {
    const pinHash = await hashPin('4821')
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 0,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '0000' }))

    expect(response.status).toBe(401)
    expect(recordFailedLogin).toHaveBeenCalledWith(expect.anything(), 'kid-1', 1, null)
  })

  it('locks the account after 5 failed attempts', async () => {
    const pinHash = await hashPin('4821')
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 4,
      locked_until: null,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '0000' }))

    expect(response.status).toBe(401)
    expect(recordFailedLogin).toHaveBeenCalledWith(expect.anything(), 'kid-1', 5, expect.any(String))
  })

  it('rejects login while locked out, even with the correct PIN', async () => {
    const pinHash = await hashPin('4821')
    const lockedUntil = new Date(Date.now() + 60_000).toISOString()
    vi.mocked(findKidByUsername).mockResolvedValue({
      id: 'kid-1',
      username: 'mimi',
      pin_hash: pinHash,
      failed_login_attempts: 5,
      locked_until: lockedUntil,
    })

    const response = await POST(makeRequest({ username: 'mimi', pin: '4821' }))
    expect(response.status).toBe(429)
  })

  it('returns 401 for an unknown username', async () => {
    vi.mocked(findKidByUsername).mockResolvedValue(null)
    const response = await POST(makeRequest({ username: 'ghost', pin: '1234' }))
    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/api/login`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement `src/app/api/login/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { verifyPin } from '@/lib/auth/pin'
import { findKidByUsername, recordFailedLogin, resetFailedLogins } from '@/lib/db/kids'
import { createSessionCookieValue, setSessionCookie } from '@/lib/auth/session'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''

  if (!username || !pin) {
    return NextResponse.json({ error: 'Username and PIN are required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const kid = await findKidByUsername(supabase, username)

  if (!kid) {
    return NextResponse.json({ error: 'Incorrect username or PIN' }, { status: 401 })
  }

  if (kid.locked_until && new Date(kid.locked_until) > new Date()) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const valid = await verifyPin(pin, kid.pin_hash)

  if (!valid) {
    const failedAttempts = kid.failed_login_attempts + 1
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : null
    await recordFailedLogin(supabase, kid.id, failedAttempts, lockedUntil)
    return NextResponse.json({ error: 'Incorrect username or PIN' }, { status: 401 })
  }

  await resetFailedLogins(supabase, kid.id)

  const cookieValue = await createSessionCookieValue({ kidId: kid.id, username: kid.username })
  const response = NextResponse.json({ id: kid.id, username: kid.username }, { status: 200 })
  setSessionCookie(response, cookieValue)
  return response
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/api/login`
Expected: PASS

- [ ] **Step 5: Write the failing page test**

Create `src/app/login/page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import LoginPage from './page'

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
    refreshMock.mockClear()
    global.fetch = vi.fn()
  })

  it('submits the form and redirects on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', username: 'mimi' }),
    } as Response)

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'))
  })

  it('shows an error message when login fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Incorrect username or PIN' }),
    } as Response)

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mimi' } })
    fireEvent.change(screen.getByLabelText('4-digit PIN'), { target: { value: '0000' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or PIN')
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- login/page.test.tsx`
Expected: FAIL — `./page` does not exist.

- [ ] **Step 7: Implement `src/app/login/page.tsx`**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, pin }),
    })

    setSubmitting(false)

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Something went wrong' }))
      setError(body.error ?? 'Something went wrong')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="username">Username</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="pin">4-digit PIN</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- login/page.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/api/login/route.ts src/app/api/login/route.test.ts src/app/login/page.tsx src/app/login/page.test.tsx
git commit -m "feat: add login API route with rate limiting, and login page"
```

---

## Task 8: Logout API Route

**Files:**
- Create: `src/app/api/logout/route.ts`
- Test: `src/app/api/logout/route.test.ts`

**Interfaces:**
- Consumes: `clearSessionCookie` (`@/lib/auth/session`).
- Produces: `POST /api/logout` returning `200 { ok: true }` with the session cookie cleared — consumed by Task 10.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/logout/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { COOKIE_NAME } from '@/lib/auth/session'
import { POST } from './route'

describe('POST /api/logout', () => {
  it('clears the session cookie', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(response.cookies.get(COOKIE_NAME)?.value).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/api/logout`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement `src/app/api/logout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth/session'

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- app/api/logout`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/logout/route.ts src/app/api/logout/route.test.ts
git commit -m "feat: add logout API route"
```

---

## Task 9: Session-Aware Home Page

**Files:**
- Create: `src/app/home-views.tsx`
- Test: `src/app/home-views.test.tsx`
- Modify: `src/app/page.tsx` (replaces Task 1's static placeholder)
- Modify: `src/app/page.test.tsx` (replaces Task 1's smoke test)

**Interfaces:**
- Consumes: `readSessionFromCookieValue`, `COOKIE_NAME` (`@/lib/auth/session`).
- Produces: `GuestHome` and `AuthenticatedHome({ username })` components from `@/app/home-views`, and the final `HomePage` server component.

- [ ] **Step 1: Write the failing tests for the view components**

Create `src/app/home-views.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import { GuestHome, AuthenticatedHome } from './home-views'

describe('GuestHome', () => {
  it('shows links to signup and login', () => {
    render(<GuestHome />)
    expect(screen.getByText('Create an account')).toBeInTheDocument()
    expect(screen.getByText('Log in')).toBeInTheDocument()
  })
})

describe('AuthenticatedHome', () => {
  beforeEach(() => {
    pushMock.mockClear()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
  })

  it('shows a welcome message with the username', () => {
    render(<AuthenticatedHome username="mimi" />)
    expect(screen.getByText('Welcome back, mimi!')).toBeInTheDocument()
  })

  it('logs out and redirects to login', async () => {
    render(<AuthenticatedHome username="mimi" />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- home-views.test.tsx`
Expected: FAIL — `./home-views` does not exist.

- [ ] **Step 3: Implement `src/app/home-views.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'

export function GuestHome() {
  return (
    <main>
      <h1>Canto</h1>
      <p>Learn Cantonese through play.</p>
      <a href="/signup">Create an account</a>
      <a href="/login">Log in</a>
    </main>
  )
}

export function AuthenticatedHome({ username }: { username: string }) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <main>
      <h1>Welcome back, {username}!</h1>
      <button onClick={handleLogout}>Log out</button>
    </main>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- home-views.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing test for the page wiring**

Replace `src/app/page.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const getMock = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))

import HomePage from './page'

describe('HomePage', () => {
  it('shows the guest view when there is no session cookie', async () => {
    getMock.mockReturnValue(undefined)
    render(await HomePage())
    expect(screen.getByText('Create an account')).toBeInTheDocument()
  })

  it('shows the authenticated view when a valid session cookie is present', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const { createSessionCookieValue } = await import('@/lib/auth/session')
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })

    render(await HomePage())
    expect(screen.getByText('Welcome back, mimi!')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- app/page.test.tsx`
Expected: FAIL — old placeholder `page.tsx` doesn't render these views.

- [ ] **Step 7: Replace `src/app/page.tsx`**

```tsx
import { cookies } from 'next/headers'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { GuestHome, AuthenticatedHome } from './home-views'

export default async function HomePage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)

  if (!session) {
    return <GuestHome />
  }

  return <AuthenticatedHome username={session.username} />
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- app/page.test.tsx`
Expected: PASS

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests from Tasks 1-9)

- [ ] **Step 10: Commit**

```bash
git add src/app/home-views.tsx src/app/home-views.test.tsx src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: add session-aware home page"
```

---

## Task 10: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** None — this task wires up automation around existing scripts (`npm run lint`, `npm test`).

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run lint and tests on push and pull request"
```

- [ ] **Step 3: Verify CI runs**

Push this branch to GitHub (see Task 11, Step 1, if the remote doesn't exist yet) and open a PR, or push directly if working solo. Confirm the "CI" check appears and passes in the GitHub Actions tab. This workflow needs no secrets — every test in this plan mocks Supabase and sets its own `SESSION_SECRET`.

---

## Task 11: Deploy to Vercel with Auto-Deploy on Merge

**Files:** None — this task is infrastructure setup, verified manually.

- [ ] **Step 1: Push the repository to GitHub**

Create a new (private or public, your choice) GitHub repository, then:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

- [ ] **Step 2: Import the project into Vercel**

In the Vercel dashboard, choose "Add New Project," import the GitHub repository. Vercel auto-detects the Next.js framework preset — accept the defaults.

- [ ] **Step 3: Add environment variables in Vercel**

In the project's Settings → Environment Variables, add for the Production (and Preview) environments:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET` (generate a fresh value with `openssl rand -base64 32` — don't reuse your local dev secret)

- [ ] **Step 4: Deploy and verify the guest flow**

Trigger the first deploy (Vercel does this automatically on import). Visit the production URL and confirm the guest home page loads with "Create an account" and "Log in" links.

- [ ] **Step 5: Verify signup and login end-to-end**

On the live URL: create an account with a test username/PIN, confirm you land on the authenticated home page showing "Welcome back, `<username>`!", click "Log out," and confirm you can log back in with the same username/PIN.

- [ ] **Step 6: Verify preview deploys and auto-deploy on merge**

Create a small branch with a trivial change (e.g. a copy tweak), push it, and open a PR. Confirm Vercel posts a preview deployment link on the PR. Merge the PR into `main` and confirm Vercel automatically redeploys production with the change live, with no manual trigger needed.

---

## Plan Complete

At the end of this plan: a kid can visit the live URL, create a username/PIN account, get logged in automatically, see a personalized welcome, log out, and log back in — all backed by Supabase, fully tested, and auto-deployed from `main`. This unblocks Plan 2 (Content Pipeline & Vocabulary Data).
