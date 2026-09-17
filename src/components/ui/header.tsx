'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  showBackLink?: boolean
  showLogout?: boolean
}

export function Header({ showBackLink = false, showLogout = false }: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <header className="bg-brand-primary border-b-4 border-brand-ink px-4 py-3 flex items-center justify-between">
      <span className="font-extrabold text-2xl text-white tracking-wide">Canto</span>
      <div className="flex items-center gap-4">
        {showBackLink && (
          <Link href="/play" className="font-bold text-white underline decoration-2 underline-offset-2">
            ← Levels
          </Link>
        )}
        {showLogout && (
          <button onClick={handleLogout} className="font-bold text-white underline decoration-2 underline-offset-2">
            Log out
          </button>
        )}
      </div>
    </header>
  )
}
