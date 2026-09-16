# Visual Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Canto app (currently zero CSS — bare unstyled HTML on every page) with a cohesive "Playful Match" visual identity: bright colors, thick black outlines, chunky rounded "sticker" shapes, using Tailwind CSS.

**Architecture:** Tailwind CSS v4 (CSS-first `@theme` config, no `tailwind.config.js`) plus five small reusable presentational components (`Header`, `Card`, `Button`/`LinkButton`, `StarRating`, `LockedLevelCard`) under `src/components/ui/`, applied across all 6 existing pages. Pure presentation-layer change — no routing, data-fetching, or game-logic changes.

**Tech Stack:** Next.js 16.3.5 (App Router, Turbopack), React 19.3.0, TypeScript, Tailwind CSS 4.3.3 (`tailwindcss` + `@tailwindcss/postcss`), `next/font/google` (Baloo 2), Vitest 5 + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-cantonese-app-visual-styling-design.md`

## Global Constraints

- Tailwind CSS v4 uses a CSS-first config: `@import 'tailwindcss'` plus an `@theme { ... }` block in `globals.css` — there is no `tailwind.config.js` and no `content: [...]` array to maintain (v4 auto-detects template files).
- Color palette (exact hex values, from the spec): primary `#FF5A5F`, secondary `#4DABF7`, star/highlight `#FFC93C`, success `#51CF66`, page background `#FFF8E7`, text/outline `#1A1A1A`, card surface `#FFFFFF`.
- Typography: a single Google Font, **Baloo 2**, loaded via `next/font/google`, applied as the site-wide `font-sans`.
- Signature "sticker" style: every card/button gets a 3-4px solid `#1A1A1A` border plus a flat, zero-blur offset drop-shadow (Tailwind arbitrary value syntax, e.g. `shadow-[4px_4px_0_0_#1A1A1A]`), with generous corner radius.
- **Every existing component's accessible text, ARIA roles, and `data-testid` attributes must be preserved exactly.** The 156 existing tests (30 files) must keep passing. The one necessary, deliberate exception is documented in Task 5 below (a DOM-nesting consequence of introducing `StarRating`, not a scope change) — do not make any other test-behavior change without first checking here whether it was anticipated.
- No animations/celebrations (deferred to the separate rewards design), no dark mode, no accessibility audit beyond reasonable contrast/focus — see the spec's Non-goals section.
- All 5 new `src/components/ui/*` components are plain presentational functions — no hooks, no `'use client'` directive, no data fetching — so they can be imported by both Server Components (e.g. `play/page.tsx`) and Client Components (e.g. `listen-tap-game.tsx`) alike.

---

### Task 1: Tailwind CSS v4 setup, brand theme, and Baloo 2 font

**Files:**
- Create: `postcss.config.mjs`
- Create: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `package.json` (new devDependencies)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: Tailwind utility classes available in every `.tsx` file (e.g. `bg-brand-primary`, `text-brand-ink`, `border-brand-ink`, `bg-brand-bg`, `bg-brand-secondary`, `bg-brand-star`, `bg-brand-success`); the default `font-sans` utility resolves to Baloo 2 everywhere. All later tasks depend on this.

- [ ] **Step 1: Install Tailwind CSS v4**

Run: `npm install -D tailwindcss @tailwindcss/postcss`

This installs `tailwindcss` and its Next.js PostCSS plugin (both resolved to `^4.3.3` as of this writing — Tailwind v4 uses a CSS-first configuration model, not the `tailwind.config.js` + `content: [...]` pattern from v3).

- [ ] **Step 2: Create the PostCSS config**

Create `postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

- [ ] **Step 3: Create the global stylesheet with the brand theme**

Create `src/app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-brand-primary: #FF5A5F;
  --color-brand-secondary: #4DABF7;
  --color-brand-star: #FFC93C;
  --color-brand-success: #51CF66;
  --color-brand-bg: #FFF8E7;
  --color-brand-ink: #1A1A1A;
  --font-sans: var(--font-baloo), sans-serif;
}

body {
  background-color: var(--color-brand-bg);
}
```

The `@theme` block registers each `--color-brand-*` custom property as a Tailwind design token, which automatically generates utility classes like `bg-brand-primary`, `text-brand-ink`, `border-brand-secondary`, etc. Setting `--font-sans` to `var(--font-baloo)` (defined by the font loader in Step 4) makes Baloo 2 the default typeface for Tailwind's `font-sans` utility and for unstyled text generally.

- [ ] **Step 4: Load Baloo 2 and import the stylesheet in the root layout**

Read the current `src/app/layout.tsx` first, then replace its full contents:

```tsx
import { Baloo_2 } from 'next/font/google'
import './globals.css'

const baloo2 = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-baloo',
})

export const metadata = {
  title: 'Canto',
  description: 'Learn Cantonese through play',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={baloo2.variable}>
      <body>{children}</body>
    </html>
  )
}
```

`next/font/google`'s `Baloo_2` export converts the font name "Baloo 2" to the underscored identifier `Baloo_2` — this is the correct import name (verify against `node_modules/next/dist/... /google/index.d.ts` or the Next.js font docs if this errors — Next's font API has changed across major versions in this project's history before). The `variable: '--font-baloo'` option exposes the loaded font as a CSS custom property on the `<html>` element (via `baloo2.variable` added to `className`), which `globals.css`'s `--font-sans: var(--font-baloo), sans-serif` then picks up.

- [ ] **Step 5: Run the full test suite — confirm it's still green**

Run: `npm test`
Expected: PASS, 156 tests (no test file references `globals.css`, Tailwind, or fonts, so this should be a pure no-op for the test suite).

- [ ] **Step 6: Run the production build — confirm the Tailwind/PostCSS pipeline compiles**

Run: `npm run build`
Expected: build succeeds with no PostCSS or Tailwind errors. If `@tailwindcss/postcss` or the `@theme` syntax errors, check the installed `tailwindcss` package's own README (`node_modules/tailwindcss/README.md`) for the exact current v4 syntax — the version actually installed is the source of truth, not this plan's assumption.

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add postcss.config.mjs src/app/globals.css src/app/layout.tsx package.json package-lock.json
git commit -m "feat: add Tailwind CSS v4, brand color theme, and Baloo 2 font"
```

---

### Task 2: Core UI primitives — Header, Card, Button, LinkButton

**Files:**
- Create: `src/components/ui/header.tsx`
- Test: `src/components/ui/header.test.tsx`
- Create: `src/components/ui/card.tsx`
- Test: `src/components/ui/card.test.tsx`
- Create: `src/components/ui/button.tsx`
- Test: `src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: Tailwind utilities from Task 1 (`bg-brand-primary`, `border-brand-ink`, etc.).
- Produces:
  - `Header({ showBackLink?: boolean }): JSX.Element` — renders the "Canto" wordmark; when `showBackLink` is `true`, also renders a link to `/play` with accessible name matching `/levels/i`.
  - `Card({ children: ReactNode, className?: string, muted?: boolean }): JSX.Element` — bordered/shadowed white container; `muted` renders a grayed-out variant.
  - `Button({ variant?: 'primary' | 'secondary', ...rest: ButtonHTMLAttributes<HTMLButtonElement> }): JSX.Element` — a real `<button>`, all standard button props (`type`, `disabled`, `onClick`, etc.) pass through.
  - `LinkButton({ href: string, variant?: 'primary' | 'secondary', children: ReactNode, className?: string }): JSX.Element` — a real `next/link` `<Link>` styled identically to `Button`, for navigation (keeps `role="link"`, distinct from `Button`'s `role="button"`).
  - All consumed by Tasks 4-7.

- [ ] **Step 1: Write the failing tests for Header**

Create `src/components/ui/header.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Header } from './header'

describe('Header', () => {
  it('renders the Canto wordmark', () => {
    render(<Header />)
    expect(screen.getByText('Canto')).toBeInTheDocument()
  })

  it('does not show a back link by default', () => {
    render(<Header />)
    expect(screen.queryByRole('link', { name: /levels/i })).not.toBeInTheDocument()
  })

  it('shows a back-to-levels link when showBackLink is true', () => {
    render(<Header showBackLink />)
    expect(screen.getByRole('link', { name: /levels/i })).toHaveAttribute('href', '/play')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- header.test`
Expected: FAIL — `src/components/ui/header.tsx` does not exist yet.

- [ ] **Step 3: Implement Header**

Create `src/components/ui/header.tsx`:

```tsx
import Link from 'next/link'

interface HeaderProps {
  showBackLink?: boolean
}

export function Header({ showBackLink = false }: HeaderProps) {
  return (
    <header className="bg-brand-primary border-b-4 border-brand-ink px-4 py-3 flex items-center justify-between">
      <span className="font-extrabold text-2xl text-white tracking-wide">Canto</span>
      {showBackLink && (
        <Link href="/play" className="font-bold text-white underline decoration-2 underline-offset-2">
          ← Levels
        </Link>
      )}
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- header.test`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tests for Card**

Create `src/components/ui/card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Card } from './card'

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Hello</Card>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('applies the default bordered white style', () => {
    render(<Card>Hello</Card>)
    expect(screen.getByText('Hello')).toHaveClass('bg-white', 'border-brand-ink')
  })

  it('applies a muted style when muted is true', () => {
    render(<Card muted>Hello</Card>)
    expect(screen.getByText('Hello')).toHaveClass('bg-gray-100', 'opacity-70')
  })

  it('merges a passed-in className', () => {
    render(<Card className="text-center">Hello</Card>)
    expect(screen.getByText('Hello')).toHaveClass('text-center')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- card.test`
Expected: FAIL — `src/components/ui/card.tsx` does not exist yet.

- [ ] **Step 7: Implement Card**

Create `src/components/ui/card.tsx`:

```tsx
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  muted?: boolean
}

export function Card({ children, className = '', muted = false }: CardProps) {
  const base = 'border-4 rounded-[20px] p-4 shadow-[4px_4px_0_0_#1A1A1A]'
  const tone = muted ? 'bg-gray-100 border-gray-400 opacity-70' : 'bg-white border-brand-ink'
  return <div className={`${base} ${tone} ${className}`}>{children}</div>
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- card.test`
Expected: PASS (4 tests)

- [ ] **Step 9: Write the failing tests for Button and LinkButton**

Create `src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button, LinkButton } from './button'

describe('Button', () => {
  it('renders its children and responds to clicks', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Play!</Button>)
    screen.getByRole('button', { name: 'Play!' }).click()
    expect(onClick).toHaveBeenCalled()
  })

  it('applies the primary variant by default', () => {
    render(<Button>Play!</Button>)
    expect(screen.getByRole('button', { name: 'Play!' })).toHaveClass('bg-brand-primary')
  })

  it('applies the secondary variant when specified', () => {
    render(<Button variant="secondary">Play!</Button>)
    expect(screen.getByRole('button', { name: 'Play!' })).toHaveClass('bg-white')
  })

  it('forwards standard button attributes like disabled and type', () => {
    render(
      <Button disabled type="submit">
        Play!
      </Button>
    )
    const button = screen.getByRole('button', { name: 'Play!' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('type', 'submit')
  })
})

describe('LinkButton', () => {
  it('renders as a link with the given href', () => {
    render(<LinkButton href="/play">Play!</LinkButton>)
    expect(screen.getByRole('link', { name: 'Play!' })).toHaveAttribute('href', '/play')
  })

  it('applies the primary variant by default', () => {
    render(<LinkButton href="/play">Play!</LinkButton>)
    expect(screen.getByRole('link', { name: 'Play!' })).toHaveClass('bg-brand-primary')
  })

  it('applies the secondary variant when specified', () => {
    render(
      <LinkButton href="/play" variant="secondary">
        Play!
      </LinkButton>
    )
    expect(screen.getByRole('link', { name: 'Play!' })).toHaveClass('bg-white')
  })
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- button.test`
Expected: FAIL — `src/components/ui/button.tsx` does not exist yet.

- [ ] **Step 11: Implement Button and LinkButton**

Create `src/components/ui/button.tsx`:

```tsx
import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const BASE =
  'inline-block font-bold border-[3px] border-brand-ink rounded-[14px] px-5 py-2.5 shadow-[3px_3px_0_0_#1A1A1A] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_#1A1A1A] transition-transform disabled:opacity-50 disabled:cursor-not-allowed text-center'

const VARIANTS = {
  primary: 'bg-brand-primary text-white',
  secondary: 'bg-white text-brand-ink',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

interface LinkButtonProps {
  href: string
  variant?: 'primary' | 'secondary'
  children: ReactNode
  className?: string
}

export function LinkButton({ href, variant = 'primary', children, className = '' }: LinkButtonProps) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  )
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- button.test`
Expected: PASS (7 tests)

- [ ] **Step 13: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (156 + 14 new = 170), lint clean.

- [ ] **Step 14: Commit**

```bash
git add src/components/ui/header.tsx src/components/ui/header.test.tsx src/components/ui/card.tsx src/components/ui/card.test.tsx src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "feat: add Header, Card, Button, and LinkButton UI primitives"
```

---

### Task 3: StarRating and LockedLevelCard

**Files:**
- Create: `src/components/ui/star-rating.tsx`
- Test: `src/components/ui/star-rating.test.tsx`
- Create: `src/components/ui/locked-level-card.tsx`
- Test: `src/components/ui/locked-level-card.test.tsx`

**Interfaces:**
- Consumes: `Card` from `src/components/ui/card.tsx` (Task 2).
- Produces:
  - `StarRating({ stars: number }): JSX.Element` — renders a decorative star icon plus `"{stars} stars"` as its own direct text node (used by Task 5).
  - `LockedLevelCard({ name: string }): JSX.Element` — a muted `Card` showing `"🔒 {name} — locked"` as continuous text (used by Task 5).

**Important design note carried into this task:** `StarRating`'s star icon is a decorative inline SVG (`aria-hidden="true"`), not a Unicode star character mixed into the text. This is deliberate: if the star glyph were inline text between other text fragments, it would corrupt substring-matching in existing/adjacent tests. Keeping the icon as a non-text SVG sibling, with `"{stars} stars"` as its own direct text node inside a nested `<span>`, keeps `"{stars} stars"` independently findable via `getByText` regardless of how a consuming page arranges it next to a level name (see Task 5 for exactly how this interacts with `play/page.tsx`'s existing tests).

- [ ] **Step 1: Write the failing tests for StarRating**

Create `src/components/ui/star-rating.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StarRating } from './star-rating'

describe('StarRating', () => {
  it('renders the star count as text', () => {
    render(<StarRating stars={24} />)
    expect(screen.getByText('24 stars')).toBeInTheDocument()
  })

  it('renders the star icon as decorative (aria-hidden)', () => {
    const { container } = render(<StarRating stars={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- star-rating.test`
Expected: FAIL — `src/components/ui/star-rating.tsx` does not exist yet.

- [ ] **Step 3: Implement StarRating**

Create `src/components/ui/star-rating.tsx`:

```tsx
interface StarRatingProps {
  stars: number
}

export function StarRating({ stars }: StarRatingProps) {
  return (
    <span className="inline-flex items-center gap-1 font-bold text-brand-ink">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="w-5 h-5 fill-brand-star stroke-brand-ink"
        strokeWidth={1.5}
      >
        <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.6z" />
      </svg>
      <span>{stars} stars</span>
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- star-rating.test`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for LockedLevelCard**

Create `src/components/ui/locked-level-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LockedLevelCard } from './locked-level-card'

describe('LockedLevelCard', () => {
  it('shows the level name and a locked indicator as one continuous text run', () => {
    render(<LockedLevelCard name="Numbers" />)
    expect(screen.getByText(/Numbers — locked/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- locked-level-card.test`
Expected: FAIL — `src/components/ui/locked-level-card.tsx` does not exist yet.

- [ ] **Step 7: Implement LockedLevelCard**

Create `src/components/ui/locked-level-card.tsx`:

```tsx
import { Card } from './card'

interface LockedLevelCardProps {
  name: string
}

export function LockedLevelCard({ name }: LockedLevelCardProps) {
  return (
    <Card muted>
      <span className="font-bold text-gray-500">🔒 {name} — locked</span>
    </Card>
  )
}
```

Note: `name` and `— locked` are kept as plain sibling text (no nested element between the lock emoji, the name, and "locked") specifically so the whole phrase stays one element's direct text content — this is what keeps `getByText(/Numbers — locked/)`-style matching working both here and in Task 5's `play/page.tsx`.

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- locked-level-card.test`
Expected: PASS (1 test)

- [ ] **Step 9: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (170 + 3 new = 173), lint clean.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/star-rating.tsx src/components/ui/star-rating.test.tsx src/components/ui/locked-level-card.tsx src/components/ui/locked-level-card.test.tsx
git commit -m "feat: add StarRating and LockedLevelCard UI components"
```

---

### Task 4: Restyle the auth pages — home views, login, signup

**Files:**
- Modify: `src/app/home-views.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/signup/page.tsx`

**Interfaces:**
- Consumes: `Header`, `Card`, `Button`, `LinkButton` from Task 2.
- Produces: no new interfaces — these are leaf pages.

**Test-preservation check for this task:** every existing test in `home-views.test.tsx`, `login/page.test.tsx`, and `signup/page.test.tsx` (read them before starting — they're unchanged since being read during planning) asserts on plain, unwrapped text (`getByText('Create an account')`, `getByText('Welcome back, mimi!')`, `getByLabelText('Username')`, `getByRole('button', { name: /log in/i })`, `findByRole('alert')` + `toHaveTextContent(...)`). None of these need any wrapping component inserted between existing text fragments — this task only needs to swap plain tags for the new styled components with unchanged text content, so **no test files should need any changes in this task**. If any assertion breaks, that's a signal a text/role/id changed unintentionally — stop and check against the current test file rather than editing the test to match.

- [ ] **Step 1: Read the current files**

Read `src/app/home-views.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, and their three test files, to confirm they match what's shown below (this plan was written against a known-good snapshot; if any of these five files have changed since, stop and reconcile before proceeding).

- [ ] **Step 2: Restyle `home-views.tsx`**

Replace the full contents of `src/app/home-views.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button, LinkButton } from '@/components/ui/button'

export function GuestHome() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-md mx-auto p-4">
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-extrabold text-brand-ink">Canto</h1>
          <p className="text-brand-ink">Learn Cantonese through play.</p>
          <div className="flex flex-col gap-3 w-full">
            <LinkButton href="/signup" variant="primary" className="w-full">
              Create an account
            </LinkButton>
            <LinkButton href="/login" variant="secondary" className="w-full">
              Log in
            </LinkButton>
          </div>
        </Card>
      </main>
    </div>
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
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-md mx-auto p-4">
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-extrabold text-brand-ink">Welcome back, {username}!</h1>
          <Button onClick={handleLogout} variant="secondary">
            Log out
          </Button>
        </Card>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Run the home-views tests**

Run: `npm test -- home-views.test`
Expected: PASS (3 tests, unmodified)

- [ ] **Step 4: Restyle `login/page.tsx`**

Replace the full contents of `src/app/login/page.tsx`:

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-md mx-auto p-4">
        <Card>
          <h1 className="text-2xl font-extrabold text-brand-ink mb-4">Log in</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label htmlFor="username" className="font-bold text-brand-ink">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="border-[3px] border-brand-ink rounded-[12px] px-3 py-2 font-sans"
            />
            <label htmlFor="pin" className="font-bold text-brand-ink">
              4-digit PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              className="border-[3px] border-brand-ink rounded-[12px] px-3 py-2 font-sans"
            />
            {error && (
              <p role="alert" className="bg-red-100 border-2 border-red-400 text-red-700 rounded-[12px] px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Log in'}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run the login page tests**

Run: `npm test -- login/page.test`
Expected: PASS (2 tests, unmodified)

- [ ] **Step 6: Restyle `signup/page.tsx`**

Replace the full contents of `src/app/signup/page.tsx`:

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-md mx-auto p-4">
        <Card>
          <h1 className="text-2xl font-extrabold text-brand-ink mb-4">Create your account</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label htmlFor="username" className="font-bold text-brand-ink">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="border-[3px] border-brand-ink rounded-[12px] px-3 py-2 font-sans"
            />
            <label htmlFor="pin" className="font-bold text-brand-ink">
              4-digit PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              className="border-[3px] border-brand-ink rounded-[12px] px-3 py-2 font-sans"
            />
            {error && (
              <p role="alert" className="bg-red-100 border-2 border-red-400 text-red-700 rounded-[12px] px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create account'}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  )
}
```

- [ ] **Step 7: Run the signup page tests**

Run: `npm test -- signup/page.test`
Expected: PASS (2 tests, unmodified)

- [ ] **Step 8: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (173, none added/removed in this task), lint clean.

- [ ] **Step 9: Commit**

```bash
git add src/app/home-views.tsx src/app/login/page.tsx src/app/signup/page.tsx
git commit -m "feat: restyle guest/authenticated home, login, and signup pages"
```

---

### Task 5: Restyle the level-select page

**Files:**
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.tsx`

**Interfaces:**
- Consumes: `Header`, `Card`, `LinkButton` (Task 2), `StarRating`, `LockedLevelCard` (Task 3).
- Produces: no new interfaces — leaf page.

**Why this task's test file changes (the one deliberate exception to "tests stay unmodified"):** the current test does `screen.getByText(/Greetings — 10 stars/)` — a single regex matched against one element's *direct* text-node children only (this is how Testing Library's `getByText` works: it does not use `element.textContent`, which would recurse into descendants; it only joins the element's own direct text-node children). Today that works because `{level.name} — {level.starsEarned} stars` are three sibling text/expression children of one `<Link>` with no element in between. Introducing `StarRating` — which is a real, separately-testable component (Task 3) — necessarily puts an *element* between "Greetings — " and "10 stars", which breaks that specific single-regex match (the wrapping element's direct text is now only "Greetings — "; "10 stars" lives inside `StarRating`'s own nested `<span>`). This is a mechanical, necessary consequence of using a real shared component here rather than a scope change — the fix is to split the one assertion into two: find the level's `<li>` by its name text, then check the star count separately within it (the existing "Find in the Scene" test in this same file already uses exactly this `within(...)` pattern).

- [ ] **Step 1: Read the current files**

Read `src/app/play/page.tsx` and `src/app/play/page.test.tsx` to confirm they match what's shown below.

- [ ] **Step 2: Update the failing test expectations**

Replace the full contents of `src/app/play/page.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const redirectMock = vi.fn()
const getMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getMock }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url)
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/progress', () => ({
  getProgressForKid: vi.fn(),
}))

import PlayPage from './page'
import { getProgressForKid } from '@/lib/db/progress'
import { createSessionCookieValue } from '@/lib/auth/session'

describe('PlayPage', () => {
  it('redirects to login when there is no session', async () => {
    getMock.mockReturnValue(undefined)
    await expect(PlayPage()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })

  it('shows unlocked levels with a Listen & Tap link and locked levels as plain text', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 10, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    expect(within(greetingsItem as HTMLElement).getByText('10 stars')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Listen & Tap' })).toHaveAttribute('href', '/play/1')
    expect(screen.getByText(/People & Family — locked/)).toBeInTheDocument()
  })

  it('shows a Find in the Scene link only for unlocked levels that have scenes', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    const cookieValue = await createSessionCookieValue({ kidId: 'kid-1', username: 'mimi' })
    getMock.mockReturnValue({ value: cookieValue })
    vi.mocked(getProgressForKid).mockResolvedValue([
      { levelId: 1, starsEarned: 200, completedGameTypes: ['listen-tap'] },
    ])

    render(await PlayPage())

    // Level 1 (Greetings) has no scene content, so its list item gets no
    // scene link even though it (and every other level) is unlocked.
    const greetingsItem = screen.getByText(/Greetings/).closest('li')
    expect(greetingsItem).not.toBeNull()
    expect(within(greetingsItem as HTMLElement).queryByRole('link', { name: 'Find in the Scene' })).not.toBeInTheDocument()
  })
})
```

(Only the two `getByText(/Greetings — .../)` lookups changed shape, per the rationale above. The link-role, href, and "locked" text assertions are untouched.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- play/page.test`
Expected: FAIL — `src/app/play/page.tsx` doesn't render `Header`/`Card`/`StarRating`/`LockedLevelCard` yet, so the new query shapes won't find matching elements (e.g. no `<li>` wraps a bare "Greetings" text node the way the test now expects it structured).

- [ ] **Step 4: Restyle `play/page.tsx`**

Replace the full contents of `src/app/play/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { SCENES } from '../../../content/scenes'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { LockedLevelCard } from '@/components/ui/locked-level-card'
import { StarRating } from '@/components/ui/star-rating'
import { LinkButton } from '@/components/ui/button'

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

export default async function PlayPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)

  if (!session) {
    redirect('/login')
  }

  const supabase = createSupabaseServerClient()
  const progress = await getProgressForKid(supabase, session.kidId)
  const levels = computeLevelStatus(LEVELS, progress)

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {levels.map((level) => (
            <li key={level.id}>
              {level.unlocked ? (
                <Card className="flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-extrabold text-brand-ink">{level.name} —</span>
                    <StarRating stars={level.starsEarned} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <LinkButton href={`/play/${level.id}`} variant="primary">
                      Listen &amp; Tap
                    </LinkButton>
                    {LEVEL_IDS_WITH_SCENES.has(level.id) && (
                      <LinkButton href={`/play/${level.id}/scene`} variant="secondary">
                        Find in the Scene
                      </LinkButton>
                    )}
                  </div>
                </Card>
              ) : (
                <LockedLevelCard name={level.name} />
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- play/page.test`
Expected: PASS (3 tests)

- [ ] **Step 6: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (173), lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/play/page.tsx src/app/play/page.test.tsx
git commit -m "feat: restyle the level-select page with Card, StarRating, and LockedLevelCard"
```

---

### Task 6: Restyle the Listen & Tap game

**Files:**
- Modify: `src/app/play/[levelId]/listen-tap-game.tsx`

**Interfaces:**
- Consumes: `Header`, `Card`, `Button` (Task 2).
- Produces: no new interfaces.

**Test-preservation check:** `listen-tap-game.test.tsx` asserts via `getByTestId` (unaffected by styling), `getByText('Level complete!')`, `getByText('You earned 3 stars.')` / `'You earned 4 stars.'` (kept as plain unwrapped `<p>` text — no `StarRating` used here, to avoid the same nesting issue handled in Task 5), `getByRole('button', { name: 'Back to levels' })`, and `findByRole('alert')` + `toHaveTextContent('Try again!')` (this matcher reads `element.textContent`, which *does* aggregate descendants, so wrapping the alert text is safe here even though it wasn't safe for the `getByText` case in Task 5). No test file changes needed in this task.

- [ ] **Step 1: Read the current file**

Read `src/app/play/[levelId]/listen-tap-game.tsx` and `src/app/play/[levelId]/listen-tap-game.test.tsx` to confirm they match what's shown below.

- [ ] **Step 2: Restyle the component**

Replace the full contents of `src/app/play/[levelId]/listen-tap-game.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  buildRounds,
  pickDistractors,
  createSeededRandom,
  shuffleItems,
  type VocabGameItem,
} from '@/lib/game/round'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STARS_FIRST_TRY = 3
const STARS_AFTER_RETRY = 1

interface ListenTapGameProps {
  levelId: number
  levelName: string
  vocabItems: VocabGameItem[]
}

export function ListenTapGame({ levelId, levelName, vocabItems }: ListenTapGameProps) {
  const router = useRouter()
  const rounds = useMemo(() => buildRounds(vocabItems), [vocabItems])

  const [roundIndex, setRoundIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [starsEarned, setStarsEarned] = useState(0)
  const [hasMissed, setHasMissed] = useState(false)
  const [phase, setPhase] = useState<'playing' | 'saving' | 'summary'>('playing')
  const audioRef = useRef<HTMLAudioElement>(null)

  const currentRound = rounds[roundIndex]
  const currentItem = currentRound?.[itemIndex]

  const choices = useMemo(() => {
    if (!currentItem) return []
    // Seeded by the item id so the server-rendered HTML and the client's
    // hydration render compute the identical order — a true Math.random()
    // here would pick different distractors/order on each pass and cause a
    // hydration mismatch between what's displayed and what each button's
    // click handler is actually bound to.
    const random = createSeededRandom(currentItem.id)
    const distractors = pickDistractors(vocabItems, currentItem, 2, random)
    return shuffleItems([currentItem, ...distractors], random)
  }, [currentItem, vocabItems])

  // Reset the "missed" flag whenever the question changes, following React's
  // documented pattern for adjusting state during render instead of an Effect.
  const [lastItemId, setLastItemId] = useState(currentItem?.id)
  if (currentItem?.id !== lastItemId) {
    setLastItemId(currentItem?.id)
    setHasMissed(false)
  }

  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [currentItem])

  async function finishLevel(finalStars: number) {
    setPhase('saving')
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'listen-tap' }),
    })
    setPhase('summary')
  }

  function handleChoice(choice: VocabGameItem) {
    if (!currentItem || phase !== 'playing') return

    if (choice.id !== currentItem.id) {
      setHasMissed(true)
      return
    }

    const earned = hasMissed ? STARS_AFTER_RETRY : STARS_FIRST_TRY
    const newStars = starsEarned + earned

    const isLastItemInRound = itemIndex + 1 >= currentRound.length
    const isLastRound = roundIndex + 1 >= rounds.length

    setStarsEarned(newStars)

    if (isLastItemInRound && isLastRound) {
      finishLevel(newStars)
      return
    }

    if (isLastItemInRound) {
      setRoundIndex((value) => value + 1)
      setItemIndex(0)
    } else {
      setItemIndex((value) => value + 1)
    }
  }

  if (phase === 'summary') {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Header showBackLink />
        <main className="max-w-md mx-auto p-4">
          <Card className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-extrabold text-brand-ink">Level complete!</h1>
            <p className="text-brand-ink font-bold">You earned {starsEarned} stars.</p>
            <Button onClick={() => router.push('/play')}>Back to levels</Button>
          </Card>
        </main>
      </div>
    )
  }

  if (!currentItem) {
    return <p>Loading...</p>
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showBackLink />
      <main className="max-w-md mx-auto p-4">
        <Card className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-extrabold text-brand-ink">{levelName}</h1>
          <p className="bg-brand-secondary text-white font-bold rounded-full px-4 py-1 inline-block">
            Round {roundIndex + 1} of {rounds.length}
          </p>
          <audio ref={audioRef} src={currentItem.audioUrl} data-testid="prompt-audio" />
          <Button variant="secondary" onClick={() => audioRef.current?.play().catch(() => {})}>
            Play again
          </Button>
          <div className="grid grid-cols-3 gap-3">
            {choices.map((choice) => (
              <button
                key={choice.id}
                data-testid={choice.id}
                disabled={phase !== 'playing'}
                onClick={() => handleChoice(choice)}
                className="border-4 border-brand-ink rounded-[16px] bg-white p-2 shadow-[4px_4px_0_0_#1A1A1A] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_#1A1A1A] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small externally-hosted SVG icons, not a Next/Image optimization candidate */}
                <img src={choice.imageUrl} alt="" width={120} height={120} className="rounded-[10px]" />
              </button>
            ))}
          </div>
          {hasMissed && (
            <p role="alert" className="bg-red-100 border-2 border-red-400 text-red-700 rounded-[12px] px-3 py-2">
              Try again!
            </p>
          )}
        </Card>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Run the listen-tap-game tests**

Run: `npm test -- listen-tap-game.test`
Expected: PASS (7 tests, unmodified)

- [ ] **Step 4: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (173), lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/play/\[levelId\]/listen-tap-game.tsx
git commit -m "feat: restyle the Listen & Tap game"
```

---

### Task 7: Restyle the Find-in-Scene game

**Files:**
- Modify: `src/app/play/[levelId]/scene/scene-game.tsx`

**Interfaces:**
- Consumes: `Header`, `Card`, `Button` (Task 2).
- Produces: no new interfaces.

**Test-preservation check:** `scene-game.test.tsx` asserts via `getByTestId('scene-image')`, `getByText('Question 2 of 2')` / `'Question 1 of 2'` (kept as plain unwrapped `<p>` text, mirroring Task 6), `getByText('Level complete!')`, `getByText('You earned 3 stars.')` / `'You earned 1 stars.'` (also kept plain, no `StarRating`), `findByRole('alert')` + `toHaveTextContent('Try again!')`, `getByRole('button', { name: 'Back to levels' })`, and `toHaveAttribute('src', ...)` on the scene image. No test file changes needed in this task.

- [ ] **Step 1: Read the current file**

Read `src/app/play/[levelId]/scene/scene-game.tsx` and `src/app/play/[levelId]/scene/scene-game.test.tsx` to confirm they match what's shown below.

- [ ] **Step 2: Restyle the component**

Replace the full contents of `src/app/play/[levelId]/scene/scene-game.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isPointInHotspot } from '@/lib/game/scene-hit-test'
import type { SceneGameData } from '@/lib/db/scenes'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STARS_FIRST_TRY = 3
const STARS_AFTER_RETRY = 1

interface SceneGameProps {
  levelId: number
  levelName: string
  scenes: SceneGameData[]
}

interface Question {
  sceneIndex: number
  objectIndex: number
}

export function SceneGame({ levelId, levelName, scenes }: SceneGameProps) {
  const router = useRouter()

  // Fixed insertion order across scenes and their objects — no
  // randomization, so there is no risk of the hydration mismatch that a
  // seeded/unseeded Math.random() call caused in ListenTapGame.
  const questions = useMemo(() => {
    const list: Question[] = []
    scenes.forEach((scene, sceneIndex) => {
      scene.objects.forEach((_, objectIndex) => {
        list.push({ sceneIndex, objectIndex })
      })
    })
    return list
  }, [scenes])

  const [questionIndex, setQuestionIndex] = useState(0)
  const [starsEarned, setStarsEarned] = useState(0)
  const [hasMissed, setHasMissed] = useState(false)
  const [phase, setPhase] = useState<'playing' | 'saving' | 'summary'>('playing')
  const audioRef = useRef<HTMLAudioElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const currentQuestion = questions[questionIndex]
  const currentScene = currentQuestion ? scenes[currentQuestion.sceneIndex] : undefined
  const currentObject = currentQuestion ? currentScene?.objects[currentQuestion.objectIndex] : undefined

  const [lastObjectId, setLastObjectId] = useState(currentObject?.id)
  if (currentObject?.id !== lastObjectId) {
    setLastObjectId(currentObject?.id)
    setHasMissed(false)
  }

  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [currentObject])

  async function finishLevel(finalStars: number) {
    setPhase('saving')
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'find-scene' }),
    })
    setPhase('summary')
  }

  function handleImageClick(event: React.MouseEvent<HTMLImageElement>) {
    if (!currentObject || phase !== 'playing') return

    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return

    const xPercent = ((event.clientX - rect.left) / rect.width) * 100
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100

    if (!isPointInHotspot(xPercent, yPercent, currentObject)) {
      setHasMissed(true)
      return
    }

    const earned = hasMissed ? STARS_AFTER_RETRY : STARS_FIRST_TRY
    const newStars = starsEarned + earned
    const isLastQuestion = questionIndex + 1 >= questions.length

    setStarsEarned(newStars)

    if (isLastQuestion) {
      finishLevel(newStars)
      return
    }

    setQuestionIndex((value) => value + 1)
  }

  if (phase === 'summary') {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Header showBackLink />
        <main className="max-w-md mx-auto p-4">
          <Card className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-extrabold text-brand-ink">Level complete!</h1>
            <p className="text-brand-ink font-bold">You earned {starsEarned} stars.</p>
            <Button onClick={() => router.push('/play')}>Back to levels</Button>
          </Card>
        </main>
      </div>
    )
  }

  if (!currentQuestion || !currentScene || !currentObject) {
    return <p>Loading...</p>
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showBackLink />
      <main className="max-w-2xl mx-auto p-4">
        <Card className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-extrabold text-brand-ink">{levelName}</h1>
          <p className="bg-brand-secondary text-white font-bold rounded-full px-4 py-1 inline-block">
            Question {questionIndex + 1} of {questions.length}
          </p>
          <audio ref={audioRef} src={currentObject.audioUrl} data-testid="prompt-audio" />
          <Button variant="secondary" onClick={() => audioRef.current?.play().catch(() => {})}>
            Play again
          </Button>
          {/* eslint-disable-next-line @next/next/no-img-element -- tapped directly by pixel coordinate, not a Next/Image optimization candidate */}
          <img
            ref={imageRef}
            src={currentScene.imageUrl}
            alt=""
            data-testid="scene-image"
            onClick={handleImageClick}
            className="cursor-pointer max-w-full border-4 border-brand-ink rounded-[16px]"
          />
          {hasMissed && (
            <p role="alert" className="bg-red-100 border-2 border-red-400 text-red-700 rounded-[12px] px-3 py-2">
              Try again!
            </p>
          )}
        </Card>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Run the scene-game tests**

Run: `npm test -- scene-game.test`
Expected: PASS (8 tests, unmodified)

- [ ] **Step 4: Full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (173), lint clean.

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds (this is the final code change in the plan — a full production build is the last mechanical check before manual QA).

- [ ] **Step 6: Commit**

```bash
git add src/app/play/\[levelId\]/scene/scene-game.tsx
git commit -m "feat: restyle the Find-in-Scene game"
```

---

## Post-implementation: live QA sweep

Not a plan task with its own commit — a manual verification pass, per the spec's Testing Approach, after all 7 tasks are merged:

Using `claude-in-chrome`, visit every page at both a phone-width viewport (~390px) and a desktop-width viewport (~1280px): `/` (guest and authenticated), `/login`, `/signup`, `/play`, a Listen & Tap game (`/play/1`), and a Find-in-Scene game (`/play/3/scene`). Confirm on each: the brand colors/Baloo 2 font render, the "sticker" border+shadow look appears on cards/buttons, tap targets are comfortably large on the phone-width view, the header's back-link appears inside games but not on `/play` itself, and locked levels are visually distinct (grayed out) from playable ones. Take screenshots of anything that looks broken or cramped and fix before considering the plan done.

## Self-Review

**Spec coverage:**
- Tailwind CSS v4 setup, color palette, Baloo 2 font → Task 1.
- Signature "sticker" border/shadow style → encoded in every component (Tasks 2-3) and every restyled page (Tasks 4-7).
- `Header`, `Card`, `Button`/`LinkButton`, `StarRating`, `LockedLevelCard` under `src/components/ui/` → Tasks 2-3.
- Page-by-page treatment for all 6 pages with markup of their own → Tasks 4-7 (the 3 files the spec says need no changes — `play/[levelId]/page.tsx`, `play/[levelId]/scene/page.tsx`, `page.tsx` — are correctly untouched by this plan).
- Responsive (phone/tablet/desktop) → Tailwind responsive utilities used in Task 5's grid (`grid-cols-1 sm:grid-cols-2`) and verified across viewports in the post-implementation QA sweep.
- Testing approach (156 tests keep passing, 5 new component test files, live QA sweep) → every task's steps, plus the Post-implementation section.
- Non-goals (no animations, no dark mode, no routing/logic changes, no full accessibility audit) → not introduced by any task; every task is presentation-only.

**Placeholder scan:** no "TBD"/"handle it"/"similar to Task N" language; every step that touches a file gives its complete contents.

**Type consistency:** `CardProps`, `ButtonProps`/`LinkButtonProps`, `HeaderProps`, `StarRatingProps`, `LockedLevelCardProps` (Tasks 2-3) match exactly how they're called in Tasks 4-7 (e.g. `<Card muted>`, `<Header showBackLink />`, `<StarRating stars={level.starsEarned} />`, `<LockedLevelCard name={level.name} />`, `<LinkButton href={...} variant="secondary">`). The `Button`/`LinkButton` split (real `<button>` vs. real `<Link>`) is applied consistently: `Button` for in-page actions (logout, submit, play again, back to levels), `LinkButton` for cross-page navigation (signup/login links, game-mode links) — matching each existing test's expected `role` (`'button'` vs `'link'`).
