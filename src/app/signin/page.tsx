'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SigninPage() {
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

    router.push('/play')
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
