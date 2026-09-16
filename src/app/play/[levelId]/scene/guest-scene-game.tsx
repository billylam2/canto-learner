'use client'

import { useGuestLevelGate } from '@/lib/guest/use-guest-level-gate'
import { SceneGame } from './scene-game'
import type { SceneGameData } from '@/lib/db/scenes'

interface GuestSceneGameProps {
  levelId: number
  levelName: string
  scenes: SceneGameData[]
}

export function GuestSceneGame({ levelId, levelName, scenes }: GuestSceneGameProps) {
  const { unlocked, onLevelComplete } = useGuestLevelGate(levelId, 'find-scene')

  if (!unlocked) {
    return <p>Loading...</p>
  }

  return <SceneGame levelId={levelId} levelName={levelName} scenes={scenes} onLevelComplete={onLevelComplete} />
}
