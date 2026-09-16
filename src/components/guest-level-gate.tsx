'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getGuestProgress, saveGuestLevelProgress } from '@/lib/guest/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../content/vocab'

interface GuestLevelGateProps {
  levelId: number
  gameType: string
  children: (onLevelComplete: (starsEarned: number) => void) => ReactNode
}

export function GuestLevelGate({ levelId, gameType, children }: GuestLevelGateProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'checking' | 'unlocked'>('checking')

  useEffect(() => {
    const progress = getGuestProgress()
    const levels = computeLevelStatus(LEVELS, progress)
    const level = levels.find((candidate) => candidate.id === levelId)

    if (level?.unlocked) {
      // Reading localStorage can only happen client-side, so this can't be
      // computed during the initial (server-rendered) render without a
      // hydration mismatch — it genuinely needs to run post-mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unlocked')
    } else {
      router.push('/play')
    }
  }, [levelId, router])

  if (status !== 'unlocked') {
    return <p>Loading...</p>
  }

  return <>{children((starsEarned) => saveGuestLevelProgress(levelId, starsEarned, gameType))}</>
}
