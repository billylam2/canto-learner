'use client'

import { useState } from 'react'

const STORAGE_KEY = 'theme'

function isDarkNow(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
  localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
}

export function ThemeToggle() {
  // The inline script in layout.tsx applies the persisted theme to <html> before paint (avoiding a
  // flash of the wrong theme), but server-rendered markup has no access to that client-only
  // preference — so this button's first client render can legitimately differ from what the
  // server sent. suppressHydrationWarning tells React that mismatch is expected here.
  const [isDark, setIsDark] = useState(isDarkNow)

  function toggle() {
    const next = !isDark
    applyTheme(next)
    setIsDark(next)
  }

  return (
    <button
      onClick={toggle}
      suppressHydrationWarning
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed top-3 right-3 z-50 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-9 h-9 flex items-center justify-center shadow"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
