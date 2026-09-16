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
