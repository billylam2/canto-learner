'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  buildRounds,
  pickDistractors,
  createSeededRandom,
  shuffleItems,
  type VocabGameItem,
} from '@/lib/game/round'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STARS_FIRST_TRY = 3
const STARS_AFTER_RETRY = 1

interface ListenTapGameProps {
  levelId: number
  levelName: string
  vocabItems: VocabGameItem[]
  onLevelComplete?: (starsEarned: number) => Promise<void> | void
  showLogout?: boolean
  showResetGuestProgress?: boolean
}

export function ListenTapGame({
  levelId,
  levelName,
  vocabItems,
  onLevelComplete,
  showLogout = false,
  showResetGuestProgress = false,
}: ListenTapGameProps) {
  const router = useRouter()

  // Randomizing word order and answer choices with real Math.random() is
  // only safe once mounted: this component is server-rendered then
  // hydrated, and a true Math.random() call during that shared render pass
  // would pick different results on the server vs. the client, causing a
  // hydration mismatch between what's displayed and what each button's
  // click handler is bound to. Before mount, everything falls back to the
  // old deterministic/seeded order so the server and the first client
  // render agree; real randomization takes over immediately after.
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true)
  }, [])

  const rounds = useMemo(() => {
    const orderedItems = hasMounted ? shuffleItems(vocabItems, Math.random) : vocabItems
    return buildRounds(orderedItems)
  }, [vocabItems, hasMounted])

  const [roundIndex, setRoundIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [starsEarned, setStarsEarned] = useState(0)
  const [hasMissed, setHasMissed] = useState(false)
  const [phase, setPhase] = useState<'playing' | 'saving' | 'summary'>('playing')
  const audioRef = useRef<HTMLAudioElement>(null)

  const currentRound = rounds[roundIndex]
  const currentItem = currentRound?.[itemIndex]

  const choices = useMemo(() => {
    if (!currentItem) return []
    const random = hasMounted ? Math.random : createSeededRandom(currentItem.id)
    const distractors = pickDistractors(vocabItems, currentItem, 2, random)
    return shuffleItems([currentItem, ...distractors], random)
  }, [currentItem, vocabItems, hasMounted])

  // Reset the "missed" flag whenever the question changes, following React's
  // documented pattern for adjusting state during render instead of an Effect.
  const [lastItemId, setLastItemId] = useState(currentItem?.id)
  if (currentItem?.id !== lastItemId) {
    setLastItemId(currentItem?.id)
    setHasMissed(false)
  }

  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [currentItem])

  async function finishLevel(finalStars: number) {
    setPhase('saving')
    if (onLevelComplete) {
      await onLevelComplete(finalStars)
    } else {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'listen-tap' }),
      })
    }
    setPhase('summary')
  }

  function handleChoice(choice: VocabGameItem) {
    if (!currentItem || phase !== 'playing') return

    if (choice.id !== currentItem.id) {
      setHasMissed(true)
      return
    }

    const earned = hasMissed ? STARS_AFTER_RETRY : STARS_FIRST_TRY
    const newStars = starsEarned + earned

    const isLastItemInRound = itemIndex + 1 >= currentRound.length
    const isLastRound = roundIndex + 1 >= rounds.length

    setStarsEarned(newStars)

    if (isLastItemInRound && isLastRound) {
      finishLevel(newStars)
      return
    }

    if (isLastItemInRound) {
      setRoundIndex((value) => value + 1)
      setItemIndex(0)
    } else {
      setItemIndex((value) => value + 1)
    }
  }

  if (phase === 'summary') {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Header showBackLink showLogout={showLogout} showResetGuestProgress={showResetGuestProgress} />
        <main className="max-w-md sm:max-w-lg lg:max-w-2xl mx-auto p-4">
          <Card className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-extrabold text-brand-ink">Level complete!</h1>
            <p className="text-brand-ink font-bold">You earned {starsEarned} stars.</p>
            <Button onClick={() => router.push('/play')}>Back to levels</Button>
          </Card>
        </main>
      </div>
    )
  }

  if (!currentItem) {
    return <p>Loading...</p>
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showBackLink showLogout={showLogout} showResetGuestProgress={showResetGuestProgress} />
      <main className="max-w-md sm:max-w-lg lg:max-w-2xl mx-auto p-4">
        <Card className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-extrabold text-brand-ink">{levelName}</h1>
          <p className="bg-brand-secondary text-white font-bold rounded-full px-4 py-1 inline-block">
            Round {roundIndex + 1} of {rounds.length}
          </p>
          <audio ref={audioRef} src={currentItem.audioUrl} data-testid="prompt-audio" />
          <Button variant="secondary" onClick={() => audioRef.current?.play().catch(() => {})}>
            Play again
          </Button>
          <div className="grid grid-cols-3 gap-3">
            {choices.map((choice) => (
              <button
                key={choice.id}
                data-testid={choice.id}
                disabled={phase !== 'playing'}
                onClick={() => handleChoice(choice)}
                className="border-4 border-brand-ink rounded-[16px] bg-white p-2 shadow-[4px_4px_0_0_#1A1A1A] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_#1A1A1A] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small externally-hosted SVG icons, not a Next/Image optimization candidate */}
                <img
                  src={choice.imageUrl}
                  alt=""
                  width={120}
                  height={120}
                  className="rounded-[10px] w-[120px] h-[120px] sm:w-[150px] sm:h-[150px] lg:w-[180px] lg:h-[180px]"
                />
              </button>
            ))}
          </div>
          {hasMissed && (
            <p role="alert" className="bg-red-100 border-2 border-red-400 text-red-700 rounded-[12px] px-3 py-2">
              Try again!
            </p>
          )}
        </Card>
      </main>
    </div>
  )
}
