'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getGuestProgress, saveGuestLevelProgress } from './progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { SCENES } from '../../../content/scenes'

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

export function useGuestLevelGate(levelId: number, gameType: string) {
  const router = useRouter()
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    const progress = getGuestProgress()
    const levels = computeLevelStatus(LEVELS, progress, LEVEL_IDS_WITH_SCENES)
    const level = levels.find((candidate) => candidate.id === levelId)
    const reachable = gameType === 'find-scene' ? level?.sceneUnlocked : level?.unlocked

    if (reachable) {
      // Reading localStorage can only happen client-side, so this can't be
      // computed during the initial (server-rendered) render without a
      // hydration mismatch — it genuinely needs to run post-mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnlocked(true)
    } else {
      router.push('/play')
    }
  }, [levelId, gameType, router])

  const onLevelComplete = useCallback(
    (starsEarned: number) => {
      saveGuestLevelProgress(levelId, starsEarned, gameType)
    },
    [levelId, gameType]
  )

  return { unlocked, onLevelComplete }
}
