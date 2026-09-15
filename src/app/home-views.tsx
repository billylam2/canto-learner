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
