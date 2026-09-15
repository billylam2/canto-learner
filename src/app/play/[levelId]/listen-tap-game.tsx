'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildRounds, pickDistractors, type VocabGameItem } from '@/lib/game/round'

const STARS_FIRST_TRY = 3
const STARS_AFTER_RETRY = 1

function shuffleChoices(items: VocabGameItem[]): VocabGameItem[] {
  return [...items].sort(() => Math.random() - 0.5)
}

interface ListenTapGameProps {
  levelId: number
  levelName: string
  vocabItems: VocabGameItem[]
}

export function ListenTapGame({ levelId, levelName, vocabItems }: ListenTapGameProps) {
  const router = useRouter()
  const rounds = useMemo(() => buildRounds(vocabItems), [vocabItems])

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
    const distractors = pickDistractors(vocabItems, currentItem, 2)
    return shuffleChoices([currentItem, ...distractors])
  }, [currentItem, vocabItems])

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
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'listen-tap' }),
    })
    setPhase('summary')
  }

  function handleChoice(choice: VocabGameItem) {
    if (!currentItem) return

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
      <main>
        <h1>Level complete!</h1>
        <p>You earned {starsEarned} stars.</p>
        <button onClick={() => router.push('/play')}>Back to levels</button>
      </main>
    )
  }

  if (!currentItem) {
    return <p>Loading...</p>
  }

  return (
    <main>
      <h1>{levelName}</h1>
      <p>
        Round {roundIndex + 1} of {rounds.length}
      </p>
      <audio ref={audioRef} src={currentItem.audioUrl} data-testid="prompt-audio" />
      <button onClick={() => audioRef.current?.play().catch(() => {})}>Play again</button>
      <div>
        {choices.map((choice) => (
          <button key={choice.id} data-testid={choice.id} onClick={() => handleChoice(choice)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small externally-hosted SVG icons, not a Next/Image optimization candidate */}
            <img src={choice.imageUrl} alt="" width={120} height={120} />
          </button>
        ))}
      </div>
      {hasMissed && <p role="alert">Try again!</p>}
    </main>
  )
}
