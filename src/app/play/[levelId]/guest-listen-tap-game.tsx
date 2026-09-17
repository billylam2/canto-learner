'use client'

import { useGuestLevelGate } from '@/lib/guest/use-guest-level-gate'
import { ListenTapGame } from './listen-tap-game'
import type { VocabGameItem } from '@/lib/game/round'

interface GuestListenTapGameProps {
  levelId: number
  levelName: string
  vocabItems: VocabGameItem[]
}

export function GuestListenTapGame({ levelId, levelName, vocabItems }: GuestListenTapGameProps) {
  const { unlocked, onLevelComplete } = useGuestLevelGate(levelId, 'listen-tap')

  if (!unlocked) {
    return <p>Loading...</p>
  }

  return (
    <ListenTapGame
      levelId={levelId}
      levelName={levelName}
      vocabItems={vocabItems}
      onLevelComplete={onLevelComplete}
      showResetGuestProgress
    />
  )
}
