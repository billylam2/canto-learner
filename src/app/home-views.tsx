'use client'

import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { LinkButton } from '@/components/ui/button'

export function GuestHome() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-md mx-auto p-4">
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-extrabold text-brand-ink">Canto</h1>
          <p className="text-brand-ink">Learn Cantonese through play.</p>
          <div className="flex flex-col gap-3 w-full">
            <LinkButton href="/play" variant="primary" className="w-full">
              Play as guest
            </LinkButton>
            <LinkButton href="/signup" variant="secondary" className="w-full">
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
  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showLogout />
      <main className="max-w-md mx-auto p-4">
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-extrabold text-brand-ink">Welcome back, {username}!</h1>
          <LinkButton href="/play" variant="primary" className="w-full">
            Play
          </LinkButton>
        </Card>
      </main>
    </div>
  )
}
