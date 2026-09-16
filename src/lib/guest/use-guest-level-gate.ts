'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getGuestProgress, saveGuestLevelProgress } from './progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'

export function useGuestLevelGate(levelId: number, gameType: string) {
  const router = useRouter()
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    const progress = getGuestProgress()
    const levels = computeLevelStatus(LEVELS, progress)
    const level = levels.find((candidate) => candidate.id === levelId)

    if (level?.unlocked) {
      // Reading localStorage can only happen client-side, so this can't be
      // computed during the initial (server-rendered) render without a
      // hydration mismatch — it genuinely needs to run post-mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnlocked(true)
    } else {
      router.push('/play')
    }
  }, [levelId, router])

  const onLevelComplete = useCallback(
    (starsEarned: number) => {
      saveGuestLevelProgress(levelId, starsEarned, gameType)
    },
    [levelId, gameType]
  )

  return { unlocked, onLevelComplete }
}
