'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isPointInHotspot } from '@/lib/game/scene-hit-test'
import type { SceneGameData } from '@/lib/db/scenes'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STARS_FIRST_TRY = 3
const STARS_AFTER_RETRY = 1

interface SceneGameProps {
  levelId: number
  levelName: string
  scenes: SceneGameData[]
  onLevelComplete?: (starsEarned: number) => Promise<void> | void
}

interface Question {
  sceneIndex: number
  objectIndex: number
}

export function SceneGame({ levelId, levelName, scenes, onLevelComplete }: SceneGameProps) {
  const router = useRouter()

  // Fixed insertion order across scenes and their objects — no
  // randomization, so there is no risk of the hydration mismatch that a
  // seeded/unseeded Math.random() call caused in ListenTapGame.
  const questions = useMemo(() => {
    const list: Question[] = []
    scenes.forEach((scene, sceneIndex) => {
      scene.objects.forEach((_, objectIndex) => {
        list.push({ sceneIndex, objectIndex })
      })
    })
    return list
  }, [scenes])

  const [questionIndex, setQuestionIndex] = useState(0)
  const [starsEarned, setStarsEarned] = useState(0)
  const [hasMissed, setHasMissed] = useState(false)
  const [phase, setPhase] = useState<'playing' | 'saving' | 'summary'>('playing')
  const audioRef = useRef<HTMLAudioElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const currentQuestion = questions[questionIndex]
  const currentScene = currentQuestion ? scenes[currentQuestion.sceneIndex] : undefined
  const currentObject = currentQuestion ? currentScene?.objects[currentQuestion.objectIndex] : undefined

  const [lastObjectId, setLastObjectId] = useState(currentObject?.id)
  if (currentObject?.id !== lastObjectId) {
    setLastObjectId(currentObject?.id)
    setHasMissed(false)
  }

  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [currentObject])

  async function finishLevel(finalStars: number) {
    setPhase('saving')
    if (onLevelComplete) {
      await onLevelComplete(finalStars)
    } else {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levelId, starsEarned: finalStars, gameType: 'find-scene' }),
      })
    }
    setPhase('summary')
  }

  function handleImageClick(event: React.MouseEvent<HTMLImageElement>) {
    if (!currentObject || phase !== 'playing') return

    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return

    const xPercent = ((event.clientX - rect.left) / rect.width) * 100
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100

    if (!isPointInHotspot(xPercent, yPercent, currentObject)) {
      setHasMissed(true)
      return
    }

    const earned = hasMissed ? STARS_AFTER_RETRY : STARS_FIRST_TRY
    const newStars = starsEarned + earned
    const isLastQuestion = questionIndex + 1 >= questions.length

    setStarsEarned(newStars)

    if (isLastQuestion) {
      finishLevel(newStars)
      return
    }

    setQuestionIndex((value) => value + 1)
  }

  if (phase === 'summary') {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Header showBackLink />
        <main className="max-w-md mx-auto p-4">
          <Card className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-extrabold text-brand-ink">Level complete!</h1>
            <p className="text-brand-ink font-bold">You earned {starsEarned} stars.</p>
            <Button onClick={() => router.push('/play')}>Back to levels</Button>
          </Card>
        </main>
      </div>
    )
  }

  if (!currentQuestion || !currentScene || !currentObject) {
    return <p>Loading...</p>
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showBackLink />
      <main className="max-w-2xl mx-auto p-4">
        <Card className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-extrabold text-brand-ink">{levelName}</h1>
          <p className="bg-brand-secondary text-white font-bold rounded-full px-4 py-1 inline-block">
            Question {questionIndex + 1} of {questions.length}
          </p>
          <audio ref={audioRef} src={currentObject.audioUrl} data-testid="prompt-audio" />
          <Button variant="secondary" onClick={() => audioRef.current?.play().catch(() => {})}>
            Play again
          </Button>
          {/* eslint-disable-next-line @next/next/no-img-element -- tapped directly by pixel coordinate, not a Next/Image optimization candidate */}
          <img
            ref={imageRef}
            src={currentScene.imageUrl}
            alt=""
            data-testid="scene-image"
            onClick={handleImageClick}
            className="cursor-pointer max-w-full border-4 border-brand-ink rounded-[16px]"
          />
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
