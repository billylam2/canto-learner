'use client'

import { useEffect, useState } from 'react'
import { getGuestProgress } from '@/lib/guest/progress'
import { computeLevelStatus, type LevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../content/vocab'
import { SCENES } from '../../content/scenes'
import { Header } from '@/components/ui/header'
import { LinkButton } from '@/components/ui/button'
import { LevelList } from '@/components/level-list'

export function GuestPlayPage() {
  const [levels, setLevels] = useState<LevelStatus[] | null>(null)

  useEffect(() => {
    // Reading localStorage can only happen client-side, so this can't be
    // computed during the initial (server-rendered) render without a
    // hydration mismatch — it genuinely needs to run post-mount.
    const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLevels(computeLevelStatus(LEVELS, getGuestProgress(), levelIdsWithScenes))
  }, [])

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showResetGuestProgress />
      <main className="max-w-3xl lg:max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h1 className="text-3xl font-extrabold text-brand-ink">Choose a level</h1>
          <LinkButton href="/pet" variant="secondary">
            🐾 My Pet
          </LinkButton>
        </div>
        {levels ? <LevelList levels={levels} /> : <p>Loading...</p>}
      </main>
    </div>
  )
}
